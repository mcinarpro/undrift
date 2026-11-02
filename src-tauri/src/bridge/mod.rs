//! The bridge: reads what Claude Code, git and GitHub already hold and pushes one list of
//! Projects to the window. Read-only (AGENTS.md § Privacy contract): it never writes under
//! `~/.claude`, in a Project folder or to GitHub. Of the transcripts it keeps only turn times and
//! the metadata lines Claude Code writes for its own resume picker.

pub mod config;
mod gh;
pub mod history;
pub mod issues;
pub mod let_go;
pub mod repo;
pub mod sessions;
pub mod transcripts;
pub mod user;

use chrono::{DateTime, FixedOffset, Local};
use config::{project_for, Config, Settings};
use history::{Record, SessionMeta};
use issues::Issue;
use repo::{Repo, RepoRead};
use serde::Serialize;
use sessions::{Session, Status};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver, TryRecvError};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// Undrift's own state folder, `~/.local/share/undrift/`; `None` without a home folder, so nothing
/// is ever written relative to the working directory.
pub fn data_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join("undrift"))
}

/// Write through a temporary file and a rename, so a crash never leaves half a file behind
/// (AGENTS.md § Privacy contract).
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)
}

/// Full `Vec<Project>`, emitted whenever anything in it changes.
pub const PROJECTS_EVENT: &str = "projects";
/// The NavUser, emitted once `gh api user` answered at start.
pub const USER_EVENT: &str = "user";
/// The loop ticks every second; the scans below run every so many ticks, and sooner when a
/// Session opens or closes, the config changes or the window asks.
const HISTORY_EVERY_TICKS: u32 = 600;
const REPO_EVERY_TICKS: u32 = 300;
/// Issues come over the network, so they are not reread on a Session opening or closing.
const ISSUES_EVERY_TICKS: u32 = 300;
/// Days of Activity the window draws (GLOSSARY.md § Drift strip).
const WINDOW_DAYS: i64 = 30;
/// Sessions listed per Project, newest first.
const MAX_SESSIONS: usize = 8;

/// A Session with a transcript, as the window shows it (src/types.ts `Session`).
#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SessionView {
    pub id: String,
    /// The folder it ran in: `claude --resume` must start there.
    pub cwd: String,
    pub title: String,
    pub last_prompt: Option<String>,
    pub last_activity: String,
}

/// An open Session as the window shows it (src/types.ts `OpenSession`).
#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OpenSessionView {
    pub id: String,
    pub cwd: String,
    pub status: Status,
    pub entrypoint: String,
    /// When the status last changed (RFC 3339): the window tells waiting from quiet with it.
    pub status_since: Option<String>,
}

/// The Area a Project is filed under, as the window shows it (src/types.ts `AreaRef`).
#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AreaView {
    pub name: String,
    pub color: String,
    /// Its place among the Areas, from 0.
    pub rank: u32,
}

/// A Project as the window shows it (src/types.ts `Project`).
#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub path: String,
    pub short_path: String,
    pub name: String,
    /// When it was put in Focus (RFC 3339); `None` when it is not in Focus.
    pub focus_since: Option<String>,
    /// The Area it is filed under; `None` when it is Unsorted.
    pub area: Option<AreaView>,
    pub repo: Option<Repo>,
    /// Local days (YYYY-MM-DD) with Activity in the last 30, oldest first.
    pub active_days: Vec<String>,
    pub last_activity: Option<String>,
    pub open_sessions: Vec<OpenSessionView>,
    /// Every Session with a transcript, newest first, open ones included: they carry the title
    /// and last prompt an open Session has no other source for.
    pub sessions: Vec<SessionView>,
    /// Open Issues of its GitHub repository; empty without one.
    pub issues: Vec<Issue>,
    /// Whether Home lists it (GLOSSARY.md § Loose End), Let Go already applied.
    pub loose_end: bool,
}

/// Latest list, shared with the commands.
#[derive(Default)]
pub struct Latest {
    /// `None` until the first list is built, so the window can tell "not read yet" from "nothing".
    pub projects: Option<Vec<Project>>,
    /// Set by the `rescan` command; the next tick rescans everything.
    pub rescan: bool,
    /// Set by the `let_go` command; the next tick rereads the Let Gos and sends the list again.
    pub rebuild: bool,
}
pub type Shared = Arc<Mutex<Latest>>;

/// A scan that runs on its own thread so a slow pass (a first replay of every transcript, git in
/// many folders, `gh` on a slow network) never stalls the live view. One pass at a time; a
/// request that comes while one runs starts another right after. A pass the window asked for is
/// answered even when nothing changed, so a Refresh button can stop.
struct Background<T> {
    rx: Option<Receiver<T>>,
    pending: bool,
    ask_pending: bool,
    ask_running: bool,
}

impl<T: Send + 'static> Background<T> {
    fn new() -> Self {
        Background { rx: None, pending: false, ask_pending: false, ask_running: false }
    }

    /// Start a pass if one is due and none runs; `asked` marks it as one to answer.
    fn run(&mut self, due: bool, asked: bool, f: impl FnOnce() -> T + Send + 'static) {
        self.pending |= due || asked;
        self.ask_pending |= asked;
        if self.pending && self.rx.is_none() {
            self.pending = false;
            self.ask_running = std::mem::take(&mut self.ask_pending);
            let (tx, rx) = channel();
            std::thread::spawn(move || {
                let _ = tx.send(f());
            });
            self.rx = Some(rx);
        }
    }

    /// The pass's result once it is in, with whether the window asked for it.
    fn poll(&mut self) -> Option<(T, bool)> {
        let rx = self.rx.as_ref()?;
        match rx.try_recv() {
            Ok(t) => {
                self.rx = None;
                Some((t, std::mem::take(&mut self.ask_running)))
            }
            // The thread died, so the next due pass retries.
            Err(TryRecvError::Disconnected) => {
                self.rx = None;
                None
            }
            Err(TryRecvError::Empty) => None,
        }
    }
}

/// What the bridge knows, from which the Project list is built.
#[derive(Default)]
struct Known {
    discovered: BTreeSet<PathBuf>,
    records: Vec<Record>,
    repos: HashMap<PathBuf, RepoRead>,
    live: Vec<Session>,
    /// Open Issues by `owner/name`.
    issues: HashMap<String, Vec<Issue>>,
    let_go: let_go::LetGo,
}

impl Known {
    /// Every Project folder: the discovered checkouts and the folders Sessions ran in, minus Hides.
    fn paths(&self, config: &Config) -> BTreeSet<PathBuf> {
        let hidden = config.hidden();
        let cwds = self.records.iter().map(|r| r.cwd.as_str()).chain(self.live.iter().map(|s| s.cwd.as_str()));
        self.discovered
            .iter()
            .cloned()
            .chain(cwds.map(|c| project_for(Path::new(c), &self.discovered)))
            .filter(|p| !hidden.contains(p) && p.is_dir())
            .collect()
    }

    /// The GitHub repositories whose Issues the Projects need.
    fn github(&self) -> BTreeSet<String> {
        self.repos.values().filter_map(|r| r.repo.github.clone()).collect()
    }

    fn build(&self, config: &Config) -> Vec<Project> {
        let focus: BTreeMap<PathBuf, &str> = config.focus.iter().map(|f| (config::expand(&f.path), f.since.as_str())).collect();
        let areas: BTreeMap<PathBuf, AreaView> = config
            .areas
            .iter()
            .enumerate()
            .flat_map(|(i, a)| a.projects.iter().map(move |p| (config::expand(p), AreaView { name: a.name.clone(), color: a.color.clone(), rank: i as u32 })))
            .collect();
        let first_day = (Local::now().date_naive() - chrono::Duration::days(WINDOW_DAYS - 1)).to_string();
        let mut by_path: BTreeMap<PathBuf, (BTreeSet<String>, Vec<&Record>, Vec<&Session>)> =
            self.paths(config).into_iter().map(|p| (p, Default::default())).collect();
        for r in &self.records {
            if let Some(e) = by_path.get_mut(&project_for(Path::new(&r.cwd), &self.discovered)) {
                e.0.extend(r.days.iter().cloned());
                e.1.push(r);
            }
        }
        for s in &self.live {
            if let Some(e) = by_path.get_mut(&project_for(Path::new(&s.cwd), &self.discovered)) {
                e.2.push(s);
            }
        }
        by_path
            .into_iter()
            .map(|(path, (mut days, mut records, open))| {
                let read = self.repos.get(&path);
                if let Some(r) = read {
                    days.extend(r.commit_days.iter().cloned());
                }
                records.sort_by(|a, b| b.meta.last_activity.cmp(&a.meta.last_activity));
                let last_commit = read.and_then(|r| r.last_commit_at.as_deref());
                let last_activity = latest(last_commit.into_iter().chain(records.first().map(|r| r.meta.last_activity.as_str())));
                let issues = read.and_then(|r| r.repo.github.as_ref()).and_then(|g| self.issues.get(g)).cloned().unwrap_or_default();
                let path_text = path.to_string_lossy().into_owned();
                let last_session = records.first().map(|r| r.meta.last_activity.as_str());
                let loose_end = loose_end(read, last_session, last_activity.as_deref(), self.let_go.get(&path_text).map(String::as_str));
                Project {
                    short_path: config::short(&path),
                    name: path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.display().to_string()),
                    focus_since: focus.get(&path).map(|s| s.to_string()),
                    area: areas.get(&path).cloned(),
                    repo: read.map(|r| r.repo.clone()),
                    active_days: days.into_iter().filter(|d| *d >= first_day).collect(),
                    last_activity,
                    open_sessions: open.iter().map(|s| open_view(s)).collect(),
                    sessions: records.iter().take(MAX_SESSIONS).map(|r| view(r.cwd.clone(), &r.meta)).collect(),
                    issues,
                    loose_end,
                    path: path_text,
                }
            })
            .collect()
    }
}

fn view(cwd: String, m: &SessionMeta) -> SessionView {
    SessionView {
        id: m.id.clone(),
        cwd,
        title: m.title.clone(),
        last_prompt: (!m.last_prompt.trim().is_empty()).then(|| m.last_prompt.clone()),
        last_activity: m.last_activity.clone(),
    }
}

fn open_view(s: &Session) -> OpenSessionView {
    OpenSessionView {
        id: s.id.clone(),
        cwd: s.cwd.clone(),
        status: s.status,
        entrypoint: s.entrypoint.clone(),
        status_since: (s.status_since > 0)
            .then(|| DateTime::from_timestamp_millis(s.status_since as i64))
            .flatten()
            .map(|t| t.with_timezone(&Local).to_rfc3339()),
    }
}

/// The latest of RFC 3339 timestamps written with different offsets, as it was written.
fn latest<'a>(ts: impl Iterator<Item = &'a str>) -> Option<String> {
    ts.filter_map(|t| DateTime::parse_from_rfc3339(t).ok().map(|d: DateTime<FixedOffset>| (d, t)))
        .max_by_key(|(d, _)| *d)
        .map(|(_, t)| t.to_owned())
}

fn instant(t: &str) -> Option<DateTime<FixedOffset>> {
    DateTime::parse_from_rfc3339(t).ok()
}

/// GLOSSARY.md § Loose End: a git repository holding work not committed or not pushed, whose last
/// Session is more recent than its last commit – and not let go of since its last Activity
/// (§ Let Go). Timestamps are compared as instants, since they are written with different offsets.
fn loose_end(read: Option<&RepoRead>, last_session: Option<&str>, last_activity: Option<&str>, let_go: Option<&str>) -> bool {
    let Some(read) = read else { return false };
    let Some(session) = last_session.and_then(instant) else { return false };
    let left_work = read.repo.changed > 0 || read.repo.unpushed.is_some_and(|n| n > 0);
    // A repo with no commit yet has nothing to be more recent than.
    let after_commit = read.last_commit_at.as_deref().and_then(instant).is_none_or(|c| session > c);
    left_work && after_commit && !let_go.is_some_and(|g| let_go_holds(g, last_activity))
}

/// A Let Go holds while no Activity came after it; one that cannot be read never hides anything.
fn let_go_holds(let_go: &str, last_activity: Option<&str>) -> bool {
    let Some(g) = instant(let_go) else { return false };
    last_activity.and_then(instant).is_none_or(|a| a <= g)
}

pub fn start(app: AppHandle) {
    let shared: Shared = Arc::default();
    app.manage(shared.clone());
    // The NavUser has a thread of its own: `gh api user` and the avatar go over the network, and
    // the Project list must not wait for them.
    let handle = app.clone();
    std::thread::spawn(move || {
        if let Some(user) = user::refresh() {
            if let Err(e) = handle.emit(USER_EVENT, &user) {
                eprintln!("bridge: emit failed: {e}");
            }
        }
    });
    std::thread::spawn(move || run(app, shared));
}

fn run(app: AppHandle, shared: Shared) {
    let mut settings = Settings::new();
    let mut known = Known { discovered: config::discover(settings.config()), let_go: let_go::read(), ..Default::default() };
    let mut history_scan: Background<Vec<Record>> = Background::new();
    let mut repo_scan: Background<HashMap<PathBuf, RepoRead>> = Background::new();
    let mut issue_scan: Background<HashMap<String, Vec<Issue>>> = Background::new();
    let mut github = BTreeSet::new();
    let mut n: u32 = 0;
    loop {
        let config_changed = settings.reload_if_changed();
        let config = settings.config().clone();
        let live = sessions::scan();
        let ids = |v: &[Session]| v.iter().map(|s| s.id.clone()).collect::<BTreeSet<_>>();
        let set_changed = ids(&live) != ids(&known.live);
        // A Session that starts or finishes a turn changes its Project's Status, so the list goes out again.
        let live_changed = live != known.live;
        known.live = live;
        let (asked, rebuild) = shared.lock().map(|mut l| (std::mem::take(&mut l.rescan), std::mem::take(&mut l.rebuild))).unwrap_or_default();
        if rebuild {
            known.let_go = let_go::read();
        }
        let mut dirty = live_changed || config_changed || rebuild;
        let mut answer = false;

        // A Session that opens or closes has a new title or last prompt, so the transcripts are reread.
        history_scan.run(n % HISTORY_EVERY_TICKS == 0 || set_changed, asked, history::scan);
        if let Some((records, was_asked)) = history_scan.poll() {
            known.records = records;
            dirty = true;
            answer |= was_asked;
        }

        // A new checkout under a root becomes a Project only once the roots are listed again.
        let repo_due = n % REPO_EVERY_TICKS == 0 || set_changed || config_changed;
        if repo_due || asked {
            known.discovered = config::discover(&config);
        }
        let paths: Vec<PathBuf> = known.paths(&config).into_iter().collect();
        repo_scan.run(repo_due, asked, move || paths.into_iter().filter_map(|p| repo::read(&p).map(|r| (p, r))).collect());
        if let Some((repos, was_asked)) = repo_scan.poll() {
            known.repos = repos;
            dirty = true;
            answer |= was_asked;
        }

        // Issues are read once per GitHub repository, in sequence, and again as soon as a repo scan
        // finds a repository that was not there before, so a new Project gets its Issues at once.
        let now = known.github();
        let github_changed = now != github;
        github = now;
        let repos = github.clone();
        issue_scan.run(n % ISSUES_EVERY_TICKS == 0 || github_changed, asked, move || {
            repos.into_iter().filter_map(|r| issues::list(&r).map(|i| (r, i))).collect()
        });
        if let Some((found, was_asked)) = issue_scan.poll() {
            // A call that failed keeps the Issues it had, and a repository no Project has any more goes.
            known.issues.extend(found);
            known.issues.retain(|r, _| github.contains(r));
            dirty = true;
            answer |= was_asked;
        }

        if dirty {
            let list = known.build(&config);
            let changed = shared
                .lock()
                .map(|mut l| {
                    let changed = answer || l.projects.as_ref() != Some(&list);
                    if changed {
                        l.projects = Some(list.clone());
                    }
                    changed
                })
                .unwrap_or(false);
            if changed {
                if let Err(e) = app.emit(PROJECTS_EVENT, &list) {
                    eprintln!("bridge: emit failed: {e}");
                }
            }
        }
        n = n.wrapping_add(1);
        std::thread::sleep(Duration::from_secs(1));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn latest_compares_instants_not_text() {
        let a = "2026-10-30T23:30:00+01:00"; // 22:30 UTC
        let b = "2026-10-30T22:45:00Z";
        assert_eq!(latest([a, b].into_iter()).as_deref(), Some(b));
        assert_eq!(latest([].into_iter()), None);
    }

    fn read(changed: u32, unpushed: Option<u32>, last_commit_at: Option<&str>) -> RepoRead {
        RepoRead { repo: Repo { changed, unpushed, ..Default::default() }, last_commit_at: last_commit_at.map(str::to_owned), ..Default::default() }
    }

    const COMMIT: &str = "2026-11-01T18:00:00+01:00";
    const LATER: &str = "2026-11-01T23:10:00+01:00";

    #[test]
    fn a_session_after_the_last_commit_that_left_changes_is_a_loose_end() {
        assert!(loose_end(Some(&read(3, Some(0), Some(COMMIT))), Some(LATER), Some(LATER), None));
    }

    #[test]
    fn a_clean_and_pushed_repo_is_not_a_loose_end() {
        assert!(!loose_end(Some(&read(0, Some(0), Some(COMMIT))), Some(LATER), Some(LATER), None));
        assert!(!loose_end(Some(&read(0, None, Some(COMMIT))), Some(LATER), Some(LATER), None));
    }

    #[test]
    fn commits_not_yet_pushed_are_work_left_behind() {
        assert!(loose_end(Some(&read(0, Some(2), Some(COMMIT))), Some(LATER), Some(LATER), None));
    }

    #[test]
    fn a_commit_after_the_last_session_closes_it() {
        // 23:00 UTC is after the session's 22:10 UTC, though its text sorts before it.
        assert!(!loose_end(Some(&read(3, Some(0), Some("2026-11-01T23:00:00Z"))), Some(LATER), Some(LATER), None));
    }

    #[test]
    fn a_repo_with_no_commit_yet_is_one_once_a_session_ran() {
        assert!(loose_end(Some(&read(3, None, None)), Some(LATER), Some(LATER), None));
        assert!(!loose_end(Some(&read(3, None, None)), None, None, None));
    }

    #[test]
    fn a_folder_that_is_not_a_repo_never_is() {
        assert!(!loose_end(None, Some(LATER), Some(LATER), None));
    }

    #[test]
    fn let_go_lasts_until_the_next_activity() {
        let r = read(3, Some(0), Some(COMMIT));
        let after = "2026-11-02T06:00:00+01:00";
        assert!(!loose_end(Some(&r), Some(LATER), Some(LATER), Some(after)));
        assert!(loose_end(Some(&r), Some("2026-11-02T07:00:00+01:00"), Some("2026-11-02T07:00:00+01:00"), Some(after)));
    }
}
