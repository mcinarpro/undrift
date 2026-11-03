//! What a Project's folder already says about it: the branch, the last commit, what is changed
//! and not committed and by how many lines, what is committed and not pushed and under which
//! subjects, its GitHub repository, and the local days with a commit in the last 30. Read with `git` itself, read-only:
//! no fetch, no write, so a row is only as fresh as the checkout.

use serde::Serialize;
use std::collections::{BTreeSet, HashMap};
use std::path::Path;
use std::process::Command;

#[derive(Serialize, Clone, PartialEq, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Repo {
    pub branch: String,
    /// Commit time of HEAD (RFC 3339); `None` on a repo with no commit yet.
    pub head_at: Option<String>,
    pub head_subject: Option<String>,
    /// Files changed, added or untracked since the last commit.
    pub changed: u32,
    /// Lines added and removed in tracked files since the last commit; `None` with no commit.
    pub diff: Option<DiffStat>,
    /// Commits ahead of the upstream, or on no remote at all when the branch has no upstream yet;
    /// `None` when the repo has no remote, since there is nowhere to push.
    pub unpushed: Option<u32>,
    /// The subjects of those commits, newest first, at most `MAX_COMMITS`.
    pub commits: Vec<String>,
    /// `owner/name` of the `origin` remote when it is on GitHub; Issues are read from it.
    pub github: Option<String>,
    /// The changed files by name, the most changed lines first, at most `MAX_FILES`.
    pub files: Vec<FileChange>,
    /// The GitHub repository's description. git does not know it, so `read` leaves it `None` and
    /// the bridge fills it from `gh` alongside the Issues.
    pub description: Option<String>,
}

/// Files kept per repo: enough for Home's big tile, few enough that a stray untracked folder
/// never floods the window.
const MAX_FILES: usize = 50;

/// Commit subjects kept per repo, for the same reason: a branch never pushed can hold hundreds.
const MAX_COMMITS: usize = 50;

/// A changed file by name and line counts – never its contents (AGENTS.md § Privacy contract).
/// Untracked and binary files have no line counts; `untracked` tells the two apart, so the window
/// calls only a file git does not know yet *new*.
#[derive(Serialize, Clone, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub insertions: Option<u32>,
    pub deletions: Option<u32>,
    pub untracked: bool,
}

/// Untracked files count in `Repo::changed` but not here: counting their lines would mean
/// reading their contents, and `git add -N` to let git do it is a write.
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct DiffStat {
    pub insertions: u32,
    pub deletions: u32,
}

/// A repo and its commits on every local branch, which feed the Project's Activity rather than
/// the window. Remote-tracking branches are left out: a commit someone else pushed is not
/// Mehmet's Activity.
#[derive(Clone, PartialEq, Debug, Default)]
pub struct RepoRead {
    pub repo: Repo,
    /// Commit time of the latest commit on any local branch (RFC 3339).
    pub last_commit_at: Option<String>,
    pub commit_days: BTreeSet<String>,
}

/// `None` when the folder is not a git checkout.
pub fn read(cwd: &Path) -> Option<RepoRead> {
    let branch = git(cwd, &["rev-parse", "--abbrev-ref", "HEAD"])?.trim().to_owned();
    // A repo with no commit yet has a branch but no log, and it is still a repo.
    let (head_at, head_subject) = git(cwd, &["log", "-1", "--format=%cI%n%s"]).and_then(|o| parse_log(&o)).unzip();
    // `-uall` lists each file of an untracked folder, which plain `--porcelain` folds into one line.
    let status = git(cwd, &["status", "--porcelain", "-uall"]).unwrap_or_default();
    let changed = parse_status(&status);
    let diff = head_at.as_ref().and_then(|_| git(cwd, &["diff", "HEAD", "--shortstat"])).map(|o| parse_shortstat(&o));
    // `--no-renames` gives a renamed file's lines under its new path, the one `--porcelain` lists,
    // where rename detection would write `old => new` and leave it with no count.
    let numstat = head_at.as_ref().and_then(|_| git(cwd, &["diff", "HEAD", "--numstat", "--no-renames"])).unwrap_or_default();
    let files = files(&status, &numstat);
    // A branch that was never pushed has no upstream, and all of its commits are still unpushed.
    let has_remote = git(cwd, &["remote"]).is_some_and(|o| !o.trim().is_empty());
    // One log both counts the commits and names them, so the count and the list never disagree.
    // `--no-show-signature` keeps a `log.showSignature` setting from adding lines to the count.
    let (unpushed, commits) = git(cwd, &["log", "--no-show-signature", "--format=%s", "@{u}..HEAD"])
        .or_else(|| has_remote.then(|| git(cwd, &["log", "--no-show-signature", "--format=%s", "HEAD", "--not", "--remotes"])).flatten())
        .map(|o| parse_subjects(&o))
        .unzip();
    let github = git(cwd, &["remote", "get-url", "origin"]).and_then(|o| parse_github(o.trim()));
    let last_commit_at = git(cwd, &["log", "--branches", "-1", "--format=%cI"]).map(|o| o.trim().to_owned()).filter(|t| !t.is_empty());
    let commit_days = git(cwd, &["log", "--branches", "--since=30 days ago", "--date=format-local:%Y-%m-%d", "--format=%cd"])
        .map(|o| o.lines().map(str::trim).filter(|l| !l.is_empty()).map(str::to_owned).collect())
        .unwrap_or_default();
    Some(RepoRead { repo: Repo { branch, head_at, head_subject, changed, diff, unpushed, commits: commits.unwrap_or_default(), github, files, description: None }, last_commit_at, commit_days })
}

/// Stdout of a git command in `cwd`, `None` when git fails (not a repo, no upstream…).
/// `--no-optional-locks` keeps `git status` from refreshing the index, which would be a write in
/// the Project folder.
fn git(cwd: &Path, args: &[&str]) -> Option<String> {
    let out = Command::new("git").arg("--no-optional-locks").arg("-C").arg(cwd).args(args).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

/// `%cI%n%s`: the commit time, then the subject.
fn parse_log(out: &str) -> Option<(String, String)> {
    let mut lines = out.lines();
    let at = lines.next()?.trim().to_owned();
    Some((at, lines.next().unwrap_or("").trim().to_owned()))
}

/// `--format=%s`: one subject per commit, newest first. A commit with an empty message still has
/// its line, so the count is the number of lines, taken before the list is cut.
fn parse_subjects(out: &str) -> (u32, Vec<String>) {
    let subjects: Vec<String> = out.lines().map(|l| l.trim().to_owned()).collect();
    (subjects.len() as u32, subjects.into_iter().take(MAX_COMMITS).collect())
}

/// One line per changed file in `--porcelain`.
fn parse_status(out: &str) -> u32 {
    out.lines().filter(|l| !l.trim().is_empty()).count() as u32
}

/// git quotes a path holding a space or an unusual character; the quotes go, the rest is kept.
fn unquote(path: &str) -> String {
    path.strip_prefix('"').and_then(|p| p.strip_suffix('"')).unwrap_or(path).to_owned()
}

/// The path of each line of `--porcelain`, after the two status letters and a space, and after
/// ` -> ` for a rename, which keeps its new path; with whether it is untracked, which `??` says.
fn parse_status_paths(out: &str) -> Vec<(String, bool)> {
    out.lines()
        .filter_map(|l| Some((l.get(3..)?, l.starts_with("??"))))
        .map(|(p, untracked)| (unquote(p.rsplit_once(" -> ").map_or(p, |(_, new)| new)), untracked))
        .collect()
}

/// `--numstat`: insertions, deletions and path, tab-separated; a binary file has `-` for both.
fn parse_numstat(out: &str) -> HashMap<String, (Option<u32>, Option<u32>)> {
    out.lines()
        .filter_map(|l| {
            let mut parts = l.splitn(3, '\t');
            let (ins, del, path) = (parts.next()?, parts.next()?, parts.next()?);
            Some((unquote(path), (ins.parse().ok(), del.parse().ok())))
        })
        .collect()
}

/// The changed files with their line counts, the most changed first, at most `MAX_FILES`.
fn files(status: &str, numstat: &str) -> Vec<FileChange> {
    let lines = parse_numstat(numstat);
    let mut files: Vec<FileChange> = parse_status_paths(status)
        .into_iter()
        .map(|(path, untracked)| {
            let (insertions, deletions) = lines.get(&path).copied().unwrap_or((None, None));
            FileChange { path, insertions, deletions, untracked }
        })
        .collect();
    let size = |f: &FileChange| f.insertions.unwrap_or(0) + f.deletions.unwrap_or(0);
    // A stable sort keeps git's order among files of the same size.
    files.sort_by_key(|f| std::cmp::Reverse(size(f)));
    files.truncate(MAX_FILES);
    files
}

/// ` 3 files changed, 10 insertions(+), 2 deletions(-)`, where either count is left out at zero
/// and the whole line is empty when nothing changed.
fn parse_shortstat(out: &str) -> DiffStat {
    let mut stat = DiffStat::default();
    for part in out.trim().split(", ") {
        let Some((n, what)) = part.split_once(' ') else { continue };
        let Ok(n) = n.parse() else { continue };
        if what.starts_with("insertion") {
            stat.insertions = n;
        } else if what.starts_with("deletion") {
            stat.deletions = n;
        }
    }
    stat
}

/// `owner/name` from an https, scp-like or ssh URL on github.com; `None` for any other host.
fn parse_github(url: &str) -> Option<String> {
    let rest = ["https://github.com/", "git@github.com:", "ssh://git@github.com/"].iter().find_map(|p| url.strip_prefix(p))?;
    let rest = rest.trim_end_matches('/');
    let rest = rest.strip_suffix(".git").unwrap_or(rest);
    let (owner, name) = rest.split_once('/')?;
    (!owner.is_empty() && !name.is_empty() && !name.contains('/')).then(|| format!("{owner}/{name}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_gives_time_and_subject() {
        assert_eq!(parse_log("2026-10-29T18:02:11+01:00\nRewrite the pricing page\n"), Some(("2026-10-29T18:02:11+01:00".into(), "Rewrite the pricing page".into())));
        assert_eq!(parse_log(""), None);
    }

    #[test]
    fn subjects_count_every_commit_and_keep_fifty() {
        assert_eq!(parse_subjects("Add the Graph\n\nFix the strip\n"), (3, vec!["Add the Graph".into(), "".into(), "Fix the strip".into()]));
        assert_eq!(parse_subjects(""), (0, vec![]));
        let many: String = (0..60).map(|i| format!("Commit {i}\n")).collect();
        let (count, subjects) = parse_subjects(&many);
        assert_eq!((count, subjects.len(), subjects[0].as_str()), (60, 50, "Commit 0"));
    }

    #[test]
    fn status_counts_lines() {
        assert_eq!(parse_status(" M src/a.ts\n?? src/b.ts\n"), 2);
        assert_eq!(parse_status(""), 0);
    }

    #[test]
    fn shortstat_gives_lines_added_and_removed() {
        assert_eq!(parse_shortstat(" 3 files changed, 10 insertions(+), 2 deletions(-)\n"), DiffStat { insertions: 10, deletions: 2 });
        assert_eq!(parse_shortstat(" 1 file changed, 1 insertion(+)\n"), DiffStat { insertions: 1, deletions: 0 });
        assert_eq!(parse_shortstat(" 1 file changed, 4 deletions(-)\n"), DiffStat { insertions: 0, deletions: 4 });
        assert_eq!(parse_shortstat(""), DiffStat::default());
    }

    #[test]
    fn status_gives_each_changed_path_a_rename_its_new_one_and_marks_untracked() {
        let out = " M src/a.ts\n?? docs/review/full.md\nR  old.rs -> src/new.rs\n?? \"with space.md\"\n";
        let paths = |v: &[(&str, bool)]| v.iter().map(|(p, u)| (p.to_string(), *u)).collect::<Vec<_>>();
        assert_eq!(parse_status_paths(out), paths(&[("src/a.ts", false), ("docs/review/full.md", true), ("src/new.rs", false), ("with space.md", true)]));
        assert!(parse_status_paths("").is_empty());
    }

    #[test]
    fn numstat_gives_lines_per_path_and_none_for_a_binary() {
        let lines = parse_numstat("10\t2\tsrc/a.ts\n-\t-\tart/icon.png\n");
        assert_eq!(lines["src/a.ts"], (Some(10), Some(2)));
        assert_eq!(lines["art/icon.png"], (None, None));
        assert!(parse_numstat("").is_empty());
    }

    #[test]
    fn files_put_the_most_changed_first_and_keep_fifty() {
        let status: String = (0..60).map(|i| format!("?? f{i}.txt\n")).collect::<String>() + " M src/a.ts\n M src/b.ts\n";
        let files = files(&status, "3\t1\tsrc/a.ts\n40\t0\tsrc/b.ts\n");
        assert_eq!(files.len(), 50);
        assert_eq!(files[0], FileChange { path: "src/b.ts".into(), insertions: Some(40), deletions: Some(0), untracked: false });
        assert_eq!(files[1].path, "src/a.ts");
        assert_eq!((files[2].insertions, files[2].untracked), (None, true));
    }

    #[test]
    fn github_remote_in_every_url_form() {
        assert_eq!(parse_github("https://github.com/mcinarpro/undrift.git").as_deref(), Some("mcinarpro/undrift"));
        assert_eq!(parse_github("https://github.com/mcinarpro/undrift").as_deref(), Some("mcinarpro/undrift"));
        assert_eq!(parse_github("git@github.com:mcinarpro/undrift.git").as_deref(), Some("mcinarpro/undrift"));
        assert_eq!(parse_github("ssh://git@github.com/mcinarpro/undrift.git").as_deref(), Some("mcinarpro/undrift"));
        assert_eq!(parse_github("https://gitlab.com/mcinarpro/undrift.git"), None);
        assert_eq!(parse_github("https://github.com/mcinarpro"), None);
    }
}
