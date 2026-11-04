//! What a Project's GitHub repository says about itself: its open Issues (GLOSSARY.md § Issue),
//! read with `gh api` because `gh issue list` cannot see an Issue's blockers, its open pull
//! requests with the state of their checks, read with `gh pr list`, and its one-line description,
//! read with `gh repo view`. All read-only and under `gh::run`'s timeout.

use super::gh;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Open Issues read per Project, newest first, as GitHub sorts them.
const PER_PAGE: &str = "50";

#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub number: u32,
    pub title: String,
    /// Label names only; their colours and descriptions stay on GitHub.
    pub labels: Vec<String>,
    /// RFC 3339 of the Issue's last update.
    pub updated_at: String,
    pub url: String,
    /// The open Issues blocking it, as GitHub's dependencies say: ready to Start at 0. The only
    /// thing kept of the dependencies – which Issues they are stays on GitHub.
    pub blocked_by: u32,
    /// RFC 3339 of the moment it was pulled into Today (GLOSSARY.md § Today); `None` otherwise.
    /// Undrift's own, set at build time from `config.json`, never from GitHub.
    pub today_since: Option<String>,
    /// RFC 3339 of the moment it was Started from Undrift; `None` otherwise. Undrift's own, set at
    /// build time from `started.json`.
    pub started_at: Option<String>,
    /// The id of the Session it was Started in; `None` otherwise. Undrift's own, as above.
    pub session_id: Option<String>,
    /// RFC 3339 of the moment it was closed on GitHub; `None` for an open Issue.
    pub closed_at: Option<String>,
}

/// What a pull request's checks say: none without any, pending while one runs, failing once one
/// failed, passing once all passed.
#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum Checks {
    None,
    Pending,
    Failing,
    Passing,
}

/// An open pull request as the Board names it. Its body, its diff and its reviewers stay on GitHub.
#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Pull {
    pub number: u32,
    pub title: String,
    pub url: String,
    pub draft: bool,
    pub checks: Checks,
    /// Opened by a bot – Renovate, Dependabot – which the Board counts rather than names.
    pub bot: bool,
}

/// The `owner/name` an Issue URL belongs to, so a stored URL can be checked against the open
/// Issues the bridge read for that repository.
pub fn repo_of(url: &str) -> Option<String> {
    let mut parts = url.strip_prefix("https://github.com/")?.splitn(3, '/');
    Some(format!("{}/{}", parts.next()?, parts.next()?))
}

/// One Issue as the REST API lists it. The endpoint also lists pull requests, told apart by their
/// `pull_request` key.
#[derive(Deserialize)]
struct IssueLine {
    number: u32,
    title: String,
    #[serde(default)]
    labels: Vec<Label>,
    #[serde(default)]
    updated_at: String,
    #[serde(default)]
    html_url: String,
    #[serde(default)]
    pull_request: Option<Value>,
    /// Missing or `null` on some Issues – Renovate's, for one – which means no blocker.
    #[serde(default)]
    issue_dependencies_summary: Option<Dependencies>,
    #[serde(default)]
    closed_at: Option<String>,
}

#[derive(Deserialize, Default)]
struct Dependencies {
    #[serde(default)]
    blocked_by: u32,
}

#[derive(Deserialize)]
struct Label {
    name: String,
}

/// The open Issues of `owner/name`; `None` when `gh` fails, times out or answers something else,
/// so the caller can keep what it had.
pub fn list(repo: &str) -> Option<Vec<Issue>> {
    parse(&gh::run(&["api", &format!("repos/{repo}/issues?state=open&per_page={PER_PAGE}")])?)
}

/// The Issues of `owner/name` closed since `since` (RFC 3339), newest first, for the Board's Done
/// column. GitHub's `since` filters on the last update, so an Issue closed earlier and touched
/// since would come too; it is left out here.
pub fn closed(repo: &str, since: &str) -> Option<Vec<Issue>> {
    let issues = parse(&gh::run(&["api", &format!("repos/{repo}/issues?state=closed&since={since}&per_page={PER_PAGE}")])?)?;
    Some(issues.into_iter().filter(|i| i.closed_at.as_deref().is_some_and(|c| c >= since)).collect())
}

#[derive(Deserialize)]
struct RepoLine {
    #[serde(default)]
    description: Option<String>,
}

/// The description of `owner/name`: `Some(None)` when the repository has none, `None` when `gh`
/// fails, so the caller can keep what it had.
pub fn description(repo: &str) -> Option<Option<String>> {
    parse_description(&gh::run(&["repo", "view", repo, "--json", "description"])?)
}

/// GitHub sends an empty string for a repository without a description, which says nothing.
fn parse_description(json: &str) -> Option<Option<String>> {
    let line: RepoLine = serde_json::from_str(json).ok()?;
    Some(line.description.map(|d| d.trim().to_owned()).filter(|d| !d.is_empty()))
}

/// One pull request as `gh pr list --json` gives it.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullLine {
    number: u32,
    title: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    is_draft: bool,
    #[serde(default)]
    status_check_rollup: Vec<Value>,
    #[serde(default)]
    author: Option<Author>,
}

#[derive(Deserialize, Default)]
struct Author {
    #[serde(default)]
    is_bot: bool,
    /// `app/renovate` for an app, on the `gh` versions that leave `is_bot` out.
    #[serde(default)]
    login: String,
}

/// The open pull requests of `owner/name`, newest first; `None` when `gh` fails, so the caller can
/// keep what it had.
pub fn pulls(repo: &str) -> Option<Vec<Pull>> {
    parse_pulls(&gh::run(&["pr", "list", "--repo", repo, "--state", "open", "--limit", "20", "--json", "number,title,url,isDraft,statusCheckRollup,author"])?)
}

fn parse_pulls(json: &str) -> Option<Vec<Pull>> {
    let lines: Vec<PullLine> = serde_json::from_str(json).ok()?;
    Some(
        lines
            .into_iter()
            .map(|l| Pull {
                number: l.number,
                title: l.title,
                url: l.url,
                draft: l.is_draft,
                checks: checks(&l.status_check_rollup),
                bot: l.author.as_ref().is_some_and(|a| a.is_bot || a.login.starts_with("app/")),
            })
            .collect(),
    )
}

/// A check run reports its `conclusion` once done, a status context its `state`. One failure fails
/// the lot, one still running keeps the lot pending.
fn checks(rollup: &[Value]) -> Checks {
    if rollup.is_empty() {
        return Checks::None;
    }
    let word = |c: &Value, k: &str| c.get(k).and_then(Value::as_str).unwrap_or("").to_ascii_uppercase();
    let mut pending = false;
    for c in rollup {
        let state = match word(c, "state") {
            s if s.is_empty() => word(c, "conclusion"),
            s => s,
        };
        match state.as_str() {
            "FAILURE" | "ERROR" | "TIMED_OUT" | "CANCELLED" | "ACTION_REQUIRED" | "STARTUP_FAILURE" => return Checks::Failing,
            "SUCCESS" | "SKIPPED" | "NEUTRAL" => {}
            _ => pending = true,
        }
    }
    if pending { Checks::Pending } else { Checks::Passing }
}

fn parse(json: &str) -> Option<Vec<Issue>> {
    let lines: Vec<IssueLine> = serde_json::from_str(json).ok()?;
    Some(
        lines
            .into_iter()
            .filter(|l| l.pull_request.is_none())
            .map(|l| Issue {
                number: l.number,
                title: l.title,
                labels: l.labels.into_iter().map(|x| x.name).collect(),
                updated_at: l.updated_at,
                url: l.html_url,
                blocked_by: l.issue_dependencies_summary.unwrap_or_default().blocked_by,
                today_since: None,
                started_at: None,
                session_id: None,
                closed_at: l.closed_at,
            })
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pull_request_reads_its_checks_and_its_author() {
        let json = r#"[{"number":44,"title":"feat: open on the last Khatm","url":"https://github.com/o/r/pull/44","isDraft":false,"author":{"is_bot":false,"login":"mcinarpro"},"statusCheckRollup":[{"__typename":"CheckRun","status":"COMPLETED","conclusion":"FAILURE"},{"__typename":"CheckRun","status":"IN_PROGRESS","conclusion":""}]},{"number":397,"title":"fix(deps)","url":"https://github.com/o/r/pull/397","isDraft":true,"author":{"login":"app/renovate"},"statusCheckRollup":[]}]"#;
        let pulls = parse_pulls(json).unwrap();
        assert_eq!((pulls[0].checks, pulls[0].bot), (Checks::Failing, false));
        assert_eq!((pulls[1].checks, pulls[1].bot, pulls[1].draft), (Checks::None, true, true));
        assert_eq!(checks(&[serde_json::json!({"__typename":"StatusContext","state":"PENDING"})]), Checks::Pending);
        assert_eq!(checks(&[serde_json::json!({"__typename":"CheckRun","status":"COMPLETED","conclusion":"SUCCESS"})]), Checks::Passing);
    }

    #[test]
    fn keeps_number_title_label_names_url_and_open_blockers() {
        let json = r#"[{"url":"https://api.github.com/repos/mcinarpro/undrift/issues/4","labels":[{"id":1,"name":"bug","description":"","color":"d73a4a"}],"number":4,"title":"Projects and Graph pages","updated_at":"2026-11-02T20:26:12Z","html_url":"https://github.com/mcinarpro/undrift/issues/4","issue_dependencies_summary":{"blocked_by":2,"blocking":0,"total_blocked_by":3,"total_blocking":0}}]"#;
        let issues = parse(json).unwrap();
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].number, 4);
        assert_eq!(issues[0].title, "Projects and Graph pages");
        assert_eq!(issues[0].labels, vec!["bug".to_string()]);
        assert_eq!(issues[0].updated_at, "2026-11-02T20:26:12Z");
        assert_eq!(issues[0].url, "https://github.com/mcinarpro/undrift/issues/4");
        assert_eq!(issues[0].blocked_by, 2);
    }

    #[test]
    fn a_closed_issue_keeps_when_it_closed_and_an_open_one_has_no_such_moment() {
        let json = r#"[{"number":7,"title":"Move the blog to Astro 6","html_url":"https://github.com/o/r/issues/7","closed_at":"2026-11-01T20:00:00Z"},{"number":8,"title":"Open","html_url":"https://github.com/o/r/issues/8","closed_at":null}]"#;
        let issues = parse(json).unwrap();
        assert_eq!(issues[0].closed_at.as_deref(), Some("2026-11-01T20:00:00Z"));
        assert_eq!(issues[1].closed_at, None);
        assert_eq!(issues[0].session_id, None);
    }

    #[test]
    fn the_repository_of_an_issue_url_is_its_owner_and_name() {
        assert_eq!(repo_of("https://github.com/mcinarpro/undrift/issues/4").as_deref(), Some("mcinarpro/undrift"));
        assert_eq!(repo_of("https://gitlab.com/o/r/issues/4"), None);
        assert_eq!(repo_of("https://github.com/mcinarpro"), None);
    }

    #[test]
    fn a_pull_request_is_skipped_and_a_missing_summary_is_no_blocker() {
        let json = r#"[{"number":9,"title":"A pull request","pull_request":{"url":"https://api.github.com/repos/o/r/pulls/9"}},{"number":397,"title":"fix(deps): update","issue_dependencies_summary":null},{"number":40,"title":"Dashboard"}]"#;
        let issues = parse(json).unwrap();
        assert_eq!(issues.iter().map(|i| i.number).collect::<Vec<_>>(), vec![397, 40]);
        assert!(issues.iter().all(|i| i.blocked_by == 0));
    }

    #[test]
    fn an_empty_list_is_no_issues_and_garbage_is_a_failure() {
        assert_eq!(parse("[]"), Some(Vec::new()));
        assert_eq!(parse("could not resolve to a Repository"), None);
    }

    #[test]
    fn a_description_is_kept_and_an_empty_one_is_none() {
        assert_eq!(parse_description(r#"{"description":"A desktop cockpit."}"#), Some(Some("A desktop cockpit.".to_string())));
        assert_eq!(parse_description(r#"{"description":""}"#), Some(None));
        assert_eq!(parse_description(r#"{"description":null}"#), Some(None));
        assert_eq!(parse_description("could not resolve to a Repository"), None);
    }
}
