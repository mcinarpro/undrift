//! What a Project's folder already says about it: the branch, the last commit, what is changed
//! and not committed and by how many lines, what is committed and not pushed, its GitHub
//! repository, and the local days with a commit in the last 30. Read with `git` itself, read-only:
//! no fetch, no write, so a row is only as fresh as the checkout.

use serde::Serialize;
use std::collections::BTreeSet;
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
    /// `owner/name` of the `origin` remote when it is on GitHub; Issues are read from it.
    pub github: Option<String>,
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
    let changed = git(cwd, &["status", "--porcelain", "-uall"]).map(|o| parse_status(&o)).unwrap_or(0);
    let diff = head_at.as_ref().and_then(|_| git(cwd, &["diff", "HEAD", "--shortstat"])).map(|o| parse_shortstat(&o));
    // A branch that was never pushed has no upstream, and all of its commits are still unpushed.
    let has_remote = git(cwd, &["remote"]).is_some_and(|o| !o.trim().is_empty());
    let unpushed = git(cwd, &["rev-list", "--count", "@{u}..HEAD"])
        .or_else(|| has_remote.then(|| git(cwd, &["rev-list", "--count", "HEAD", "--not", "--remotes"])).flatten())
        .and_then(|o| o.trim().parse().ok());
    let github = git(cwd, &["remote", "get-url", "origin"]).and_then(|o| parse_github(o.trim()));
    let last_commit_at = git(cwd, &["log", "--branches", "-1", "--format=%cI"]).map(|o| o.trim().to_owned()).filter(|t| !t.is_empty());
    let commit_days = git(cwd, &["log", "--branches", "--since=30 days ago", "--date=format-local:%Y-%m-%d", "--format=%cd"])
        .map(|o| o.lines().map(str::trim).filter(|l| !l.is_empty()).map(str::to_owned).collect())
        .unwrap_or_default();
    Some(RepoRead { repo: Repo { branch, head_at, head_subject, changed, diff, unpushed, github }, last_commit_at, commit_days })
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

/// One line per changed file in `--porcelain`.
fn parse_status(out: &str) -> u32 {
    out.lines().filter(|l| !l.trim().is_empty()).count() as u32
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
    fn github_remote_in_every_url_form() {
        assert_eq!(parse_github("https://github.com/mcinarpro/undrift.git").as_deref(), Some("mcinarpro/undrift"));
        assert_eq!(parse_github("https://github.com/mcinarpro/undrift").as_deref(), Some("mcinarpro/undrift"));
        assert_eq!(parse_github("git@github.com:mcinarpro/undrift.git").as_deref(), Some("mcinarpro/undrift"));
        assert_eq!(parse_github("ssh://git@github.com/mcinarpro/undrift.git").as_deref(), Some("mcinarpro/undrift"));
        assert_eq!(parse_github("https://gitlab.com/mcinarpro/undrift.git"), None);
        assert_eq!(parse_github("https://github.com/mcinarpro"), None);
    }
}
