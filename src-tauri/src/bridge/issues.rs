//! What a Project's GitHub repository says about itself: its open Issues (GLOSSARY.md § Issue),
//! read with `gh issue list`, and its one-line description, read with `gh repo view`. Both are
//! read-only and under `gh::run`'s timeout.

use super::gh;
use serde::{Deserialize, Serialize};

/// Open Issues read per Project, newest first, as `gh` sorts them.
const LIMIT: &str = "50";

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
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueLine {
    number: u32,
    title: String,
    #[serde(default)]
    labels: Vec<Label>,
    #[serde(default)]
    updated_at: String,
    #[serde(default)]
    url: String,
}

#[derive(Deserialize)]
struct Label {
    name: String,
}

/// The open Issues of `owner/name`; `None` when `gh` fails, times out or answers something else,
/// so the caller can keep what it had.
pub fn list(repo: &str) -> Option<Vec<Issue>> {
    let args = ["issue", "list", "-R", repo, "--state", "open", "--limit", LIMIT, "--json", "number,title,labels,updatedAt,url"];
    parse(&gh::run(&args)?)
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

fn parse(json: &str) -> Option<Vec<Issue>> {
    let lines: Vec<IssueLine> = serde_json::from_str(json).ok()?;
    Some(
        lines
            .into_iter()
            .map(|l| Issue { number: l.number, title: l.title, labels: l.labels.into_iter().map(|x| x.name).collect(), updated_at: l.updated_at, url: l.url })
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_number_title_label_names_and_url() {
        let json = r#"[{"labels":[{"id":"L1","name":"bug","description":"","color":"d73a4a"}],"number":4,"title":"Projects and Graph pages","updatedAt":"2026-11-02T20:26:12Z","url":"https://github.com/mcinarpro/undrift/issues/4"}]"#;
        let issues = parse(json).unwrap();
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].number, 4);
        assert_eq!(issues[0].title, "Projects and Graph pages");
        assert_eq!(issues[0].labels, vec!["bug".to_string()]);
        assert_eq!(issues[0].updated_at, "2026-11-02T20:26:12Z");
        assert_eq!(issues[0].url, "https://github.com/mcinarpro/undrift/issues/4");
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
