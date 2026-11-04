//! The bridge: reads what Claude Code, git and GitHub already hold and pushes one list of
//! Projects to the window. Read-only (AGENTS.md § Privacy contract): it never writes under
//! `~/.claude`, in a Project folder or to GitHub. Of the transcripts it keeps only turn times and
//! the metadata lines Claude Code writes for its own resume picker.

pub mod config;
mod gh;
pub mod history;
pub mod issues;
pub mod let_go;
pub mod reads_first;
pub mod repo;
pub mod sessions;
pub mod started;
pub mod transcripts;
pub mod user;

use chrono::{DateTime, FixedOffset, Local};
use config::{project_for, Config, Settings};
use history::{Record, SessionMeta};
use issues::Issue;
use reads_first::ReadsFirst;
use repo::{Repo, RepoRead};
use serde::Serialize;
use sessions::{Session, Status};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver, TryRecvError};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
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

/// A `Snapshot`, emitted whenever the Projects or what has been read of them changes.
pub const PROJECTS_EVENT: &str = "projects";
/// The NavUser once `gh api user` answered at start; `null` when it could not tell who is signed in.
pub const USER_EVENT: &str = "user";
/// The loop ticks every second; the scans below run every so many ticks, and sooner when a
/// Session opens or closes, the config changes or the window asks.
const HISTORY_EVERY_TICKS: u32 = 600;
const REPO_EVERY_TICKS: u32 = 300;
/// Issues and repository descriptions come over the network, so they are not reread on a Session
/// opening or closing.
const GITHUB_EVERY_TICKS: u32 = 300;
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
    /// The last line of Claude's last reply: the question it left you on.
    pub last_reply: Option<String>,
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

/// A Project as the window shows it (src/types.ts `Project`).
#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub path: String,
    pub short_path: String,
    pub name: String,
    /// When it was put in Focus (RFC 3339); `None` when it is not in Focus.
    pub focus_since: Option<String>,
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
    /// The Issues of its GitHub repository closed in the last week, the Board's Done; empty
    /// without one. Apart, so the pages that count open Issues keep counting them.
    pub closed: Vec<Issue>,
    /// Whether Home lists it (GLOSSARY.md § Loose End), Let Go already applied.
    pub loose_end: bool,
    /// What every Session reads before its first prompt; `None` when the folder has nothing.
    pub reads_first: Option<ReadsFirst>,
}

/// Which passes the list holds (src/types.ts `Read`). A pass counts once it finished after the one
/// it depends on – git after the transcripts, which name the folders Sessions ran in, and GitHub
/// after git, which names the repositories – so the window can tell "not read yet" from "nothing":
/// no Loose End, no git repository, no open Issue.
#[derive(Serialize, Clone, Copy, PartialEq, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Read {
    pub sessions: bool,
    pub git: bool,
    pub github: bool,
}

/// What the window is sent: the Projects, and which passes they hold (src/types.ts `Snapshot`).
#[derive(Serialize, Clone, PartialEq, Debug)]
pub struct Snapshot {
    pub projects: Vec<Project>,
    pub read: Read,
    /// True on the list that answers a rescan, once every pass it asked is in – so a Refresh says
    /// "current" once, not three times.
    pub answered: bool,
}

/// Folders git reads at once, and GitHub repositories `gh` reads at once. Each spends its time
/// starting processes and waiting on the disk or the network, so a pass in sequence took as many
/// times longer as there are Projects; `gh` keeps fewer, to stay gentle with GitHub's rate limit.
const GIT_WORKERS: usize = 8;
const GH_WORKERS: usize = 4;

/// `f` over every item on up to `workers` threads, the answers in the items' order.
fn in_parallel<T: Sync, R: Send>(items: &[T], workers: usize, f: impl Fn(&T) -> R + Sync) -> Vec<R> {
    let next = AtomicUsize::new(0);
    let mut done: Vec<(usize, R)> = std::thread::scope(|s| {
        let threads: Vec<_> = (0..workers.min(items.len()))
            .map(|_| {
                s.spawn(|| {
                    let mut mine = Vec::new();
                    loop {
                        let i = next.fetch_add(1, Ordering::Relaxed);
                        let Some(item) = items.get(i) else { break mine };
                        mine.push((i, f(item)));
                    }
                })
            })
            .collect();
        threads.into_iter().flat_map(|t| t.join().unwrap_or_default()).collect()
    });
    done.sort_by_key(|(i, _)| *i);
    done.into_iter().map(|(_, r)| r).collect()
}

/// Whether `gh api user` has answered since start, with an account or without one.
pub static USER_ANSWERED: AtomicBool = AtomicBool::new(false);

/// Latest list, shared with the commands.
#[derive(Default)]
pub struct Latest {
    /// `None` until the first list is built, so the window can tell "not read yet" from "nothing".
    pub projects: Option<Vec<Project>>,
    /// Which passes `projects` holds, sent with it.
    pub read: Read,
    /// Set by the `rescan` command; the next tick rescans everything.
    pub rescan: bool,
    /// Set by the `let_go`, `start` and `forget_start` commands; the next tick rereads the Let Gos
    /// and the Starts and sends the list again.
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

    /// Whether a pass the window asked for is still to come.
    fn answering(&self) -> bool {
        self.ask_pending || self.ask_running
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

/// One GitHub repository as a pass read it; each part is `None` when its `gh` call failed.
struct GitHubRead {
    repo: String,
    issues: Option<Vec<Issue>>,
    /// The Issues closed in the last `DONE_DAYS`, for the Board's Done column.
    closed: Option<Vec<Issue>>,
    description: Option<Option<String>>,
}

/// How long a closed Issue stays in Done (GLOSSARY.md § Done).
const DONE_DAYS: i64 = 7;

/// What the bridge knows, from which the Project list is built.
#[derive(Default)]
struct Known {
    discovered: BTreeSet<PathBuf>,
    records: Vec<Record>,
    repos: HashMap<PathBuf, RepoRead>,
    /// Read in the same pass as the repos, for the folders that have something to read.
    reads_first: HashMap<PathBuf, ReadsFirst>,
    live: Vec<Session>,
    /// Open Issues by `owner/name`.
    issues: HashMap<String, Vec<Issue>>,
    /// The Issues closed in the last `DONE_DAYS`, by `owner/name`.
    closed: HashMap<String, Vec<Issue>>,
    /// Repository descriptions by `owner/name`; `None` for a repository without one.
    descriptions: HashMap<String, Option<String>>,
    let_go: let_go::LetGo,
    /// The Issues Started from Undrift, which the Board's Doing column shows.
    started: started::Started,
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
        let today: BTreeMap<&str, &str> = config.today.iter().map(|t| (t.url.as_str(), t.since.as_str())).collect();
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
                let mut issues = read.and_then(|r| r.repo.github.as_ref()).and_then(|g| self.issues.get(g)).cloned().unwrap_or_default();
                // Today and the Starts are Undrift's own, kept by URL: an entry whose Issue is no
                // longer open matches nothing and is simply not shown, with no write here.
                for i in &mut issues {
                    i.today_since = today.get(i.url.as_str()).map(|s| (*s).to_owned());
                    let start = self.started.get(&i.url);
                    i.started_at = start.map(|s| s.at.clone());
                    i.session_id = start.map(|s| s.session.clone());
                }
                let closed = read.and_then(|r| r.repo.github.as_ref()).and_then(|g| self.closed.get(g)).cloned().unwrap_or_default();
                let path_text = path.to_string_lossy().into_owned();
                let last_session = records.first().map(|r| r.meta.last_activity.as_str());
                let loose_end = loose_end(read, last_session, last_activity.as_deref(), self.let_go.get(&path_text).map(String::as_str));
                Project {
                    short_path: config::short(&path),
                    name: path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.display().to_string()),
                    focus_since: focus.get(&path).map(|s| s.to_string()),
                    repo: read.map(|r| Repo {
                        description: r.repo.github.as_ref().and_then(|g| self.descriptions.get(g)).cloned().flatten(),
                        ..r.repo.clone()
                    }),
                    active_days: days.into_iter().filter(|d| *d >= first_day).collect(),
                    last_activity,
                    open_sessions: open.iter().map(|s| open_view(s)).collect(),
                    sessions: records.iter().take(MAX_SESSIONS).map(|r| view(r.cwd.clone(), &r.meta)).collect(),
                    issues,
                    closed,
                    loose_end,
                    reads_first: self.reads_first.get(&path).cloned(),
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
        last_reply: (!m.last_reply.trim().is_empty()).then(|| m.last_reply.clone()),
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
    // A repo with no commit yet has no last commit for a Session to be more recent than, so it is
    // never a Loose End: there is no finished work it was left behind from.
    let after_commit = read.last_commit_at.as_deref().and_then(instant).is_some_and(|c| session > c);
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
    // It is sent even when `gh` could not say who is signed in, so the window stops waiting, and
    // kept as answered for a window that starts listening after it went out.
    std::thread::spawn(move || {
        let user = user::refresh();
        USER_ANSWERED.store(true, Ordering::Relaxed);
        if let Err(e) = handle.emit(USER_EVENT, &user) {
            eprintln!("bridge: emit failed: {e}");
        }
    });
    std::thread::spawn(move || run(app, shared));
}

fn run(app: AppHandle, shared: Shared) {
    let mut settings = Settings::new();
    let mut known = Known { discovered: config::discover(settings.config()), let_go: let_go::read(), started: started::read(), ..Default::default() };
    let mut history_scan: Background<Vec<Record>> = Background::new();
    // Each pass hands back what it was asked to read, so a pass that started before a folder or a
    // repository was known never counts for it.
    let mut repo_scan: Background<(BTreeSet<PathBuf>, HashMap<PathBuf, RepoRead>, HashMap<PathBuf, ReadsFirst>)> = Background::new();
    let mut github_scan: Background<(BTreeSet<String>, Vec<GitHubRead>)> = Background::new();
    let mut github = BTreeSet::new();
    let mut paths_seen = BTreeSet::new();
    let mut repos_covered = BTreeSet::new();
    let mut github_covered = BTreeSet::new();
    let mut read = Read::default();
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
            known.started = started::read();
        }
        let mut dirty = live_changed || config_changed || rebuild;
        let mut answer = false;

        // A Session that opens or closes has a new title or last prompt, so the transcripts are reread.
        history_scan.run(n % HISTORY_EVERY_TICKS == 0 || set_changed, asked, history::scan);
        if let Some((records, was_asked)) = history_scan.poll() {
            known.records = records;
            read.sessions = true;
            dirty = true;
            answer |= was_asked;
        }

        // A new checkout under a root becomes a Project only once the roots are listed again. git
        // waits for the transcripts, which name the folders Sessions ran in, so the first pass reads
        // every folder once rather than twice; after that, a folder named for the first time is
        // read at once, so it is never shown as no git repository until the next scan.
        let mut repo_due = n % REPO_EVERY_TICKS == 0 || set_changed || config_changed;
        if repo_due || asked {
            known.discovered = config::discover(&config);
        }
        let paths = known.paths(&config);
        if read.sessions {
            repo_due |= paths != paths_seen;
            paths_seen = paths.clone();
        } else {
            repo_due = false;
        }
        repo_scan.run(repo_due, asked && read.sessions, move || {
            let list: Vec<PathBuf> = paths.iter().cloned().collect();
            // One pass over the folders reads both git and Reads First, so they are as fresh as each other.
            let found = in_parallel(&list, GIT_WORKERS, |p| (repo::read(p), reads_first::read(p)));
            let mut repos = HashMap::new();
            let mut reads = HashMap::new();
            for ((repo, read), p) in found.into_iter().zip(list) {
                if let Some(r) = repo {
                    repos.insert(p.clone(), r);
                }
                if let Some(r) = read {
                    reads.insert(p, r);
                }
            }
            (paths, repos, reads)
        });
        if let Some(((covered, repos, reads), was_asked)) = repo_scan.poll() {
            known.repos = repos;
            known.reads_first = reads;
            repos_covered = covered;
            dirty = true;
            answer |= was_asked;
        }

        // Issues and descriptions are read once per GitHub repository, a few at a time, and again as
        // soon as a repo scan finds a repository that was not there before, so a new Project gets
        // them at once.
        let now = known.github();
        let github_changed = now != github;
        github = now;
        let repos = github.clone();
        github_scan.run(n % GITHUB_EVERY_TICKS == 0 || github_changed, asked, move || {
            let list: Vec<&String> = repos.iter().collect();
            let since = (chrono::Utc::now() - chrono::Duration::days(DONE_DAYS)).to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
            let found = in_parallel(&list, GH_WORKERS, |r| GitHubRead { issues: issues::list(r), closed: issues::closed(r, &since), description: issues::description(r), repo: (*r).clone() });
            (repos, found)
        });
        if let Some(((covered, found), was_asked)) = github_scan.poll() {
            github_covered = covered;
            // A call that failed keeps what it had, and a repository no Project has any more goes.
            for f in found {
                if let Some(i) = f.issues {
                    known.issues.insert(f.repo.clone(), i);
                }
                if let Some(c) = f.closed {
                    known.closed.insert(f.repo.clone(), c);
                }
                if let Some(d) = f.description {
                    known.descriptions.insert(f.repo, d);
                }
            }
            known.issues.retain(|r, _| github.contains(r));
            known.closed.retain(|r, _| github.contains(r));
            known.descriptions.retain(|r, _| github.contains(r));
            dirty = true;
            answer |= was_asked;
        }

        // Once a pass holds everything there is, it counts for good: a folder or a repository that
        // shows up later is read by the next pass, and the window keeps its page meanwhile rather
        // than fall back to Skeletons. A `gh` call that failed counts as read: what it could not
        // read is an error, not a wait, and waiting for it could last for good.
        let was = read;
        read.git |= read.sessions && paths_seen.is_subset(&repos_covered);
        read.github |= read.git && github.is_subset(&github_covered);
        dirty |= read != was;

        if dirty {
            let list = known.build(&config);
            let changed = shared
                .lock()
                .map(|mut l| {
                    let changed = answer || l.projects.as_ref() != Some(&list) || l.read != read;
                    if changed {
                        l.projects = Some(list.clone());
                        l.read = read;
                    }
                    changed
                })
                .unwrap_or(false);
            if changed {
                let answered = answer && !history_scan.answering() && !repo_scan.answering() && !github_scan.answering();
                if let Err(e) = app.emit(PROJECTS_EVENT, &Snapshot { projects: list, read, answered }) {
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
    fn a_repo_with_no_commit_yet_is_never_one() {
        assert!(!loose_end(Some(&read(3, None, None)), Some(LATER), Some(LATER), None));
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
