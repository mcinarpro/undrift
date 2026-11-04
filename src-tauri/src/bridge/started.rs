//! The Issues Started from Undrift (GLOSSARY.md § Start), by URL, with the moment the terminal
//! opened and the session id `claude` was given, in `~/.local/share/undrift/started.json`. It is
//! what puts a Note in the Board's Doing column and under its Card: the bridge keeps no prompt
//! text, so this file is the only link between an Issue and the Session begun on it. An entry
//! lasts until the Issue closes on GitHub or Mehmet takes the Note out of Doing.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// One Start: when, and the id of the Session it opened.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Start {
    /// RFC 3339 of the moment the terminal opened.
    pub at: String,
    /// The session id handed to `claude --session-id`.
    pub session: String,
}

/// Issue URL → its Start.
pub type Started = BTreeMap<String, Start>;

fn file() -> Option<PathBuf> {
    super::data_dir().map(|d| d.join("started.json"))
}

pub fn read() -> Started {
    file().map(|f| read_from(&f)).unwrap_or_default()
}

/// Records that the Issue was Started at `at` in Session `session`, replacing an earlier Start of it.
pub fn stamp(url: &str, at: &str, session: &str) -> std::io::Result<()> {
    let file = file().ok_or_else(|| std::io::Error::other("no data folder"))?;
    stamp_in(&file, url, at, session)
}

/// Forgets the Start of the Issue, so its Note leaves Doing.
pub fn forget(url: &str) -> std::io::Result<()> {
    let file = file().ok_or_else(|| std::io::Error::other("no data folder"))?;
    forget_in(&file, url)
}

/// Forgets every Issue `dead` says is no longer open, writing only when one was.
pub fn prune(dead: impl Fn(&str) -> bool) -> std::io::Result<()> {
    let file = file().ok_or_else(|| std::io::Error::other("no data folder"))?;
    prune_in(&file, dead)
}

/// A missing or unreadable file has no Start on record, so a broken file never fills Doing.
fn read_from(file: &Path) -> Started {
    std::fs::read_to_string(file).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

fn stamp_in(file: &Path, url: &str, at: &str, session: &str) -> std::io::Result<()> {
    let mut all = read_from(file);
    all.insert(url.to_owned(), Start { at: at.to_owned(), session: session.to_owned() });
    super::write_atomic(file, &serde_json::to_vec_pretty(&all)?)
}

fn forget_in(file: &Path, url: &str) -> std::io::Result<()> {
    let mut all = read_from(file);
    if all.remove(url).is_none() {
        return Ok(());
    }
    super::write_atomic(file, &serde_json::to_vec_pretty(&all)?)
}

fn prune_in(file: &Path, dead: impl Fn(&str) -> bool) -> std::io::Result<()> {
    let mut all = read_from(file);
    let before = all.len();
    all.retain(|url, _| !dead(url));
    if all.len() == before {
        return Ok(());
    }
    super::write_atomic(file, &serde_json::to_vec_pretty(&all)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("undrift-started-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir.join("started.json")
    }

    const A: &str = "https://github.com/mcinarpro/undrift/issues/22";
    const B: &str = "https://github.com/mcinarpro/undrift/issues/19";
    const S1: &str = "7f3b2c10-1a2b-4c3d-9e8f-000000000001";
    const S2: &str = "7f3b2c10-1a2b-4c3d-9e8f-000000000002";

    #[test]
    fn a_start_is_remembered_per_issue_with_its_session_and_replaced_by_the_next() {
        let file = temp("stamp");
        stamp_in(&file, A, "2026-11-04T06:00:00+01:00", S1).unwrap();
        stamp_in(&file, B, "2026-11-04T06:05:00+01:00", S2).unwrap();
        stamp_in(&file, A, "2026-11-04T07:00:00+01:00", S2).unwrap();
        let read = read_from(&file);
        assert_eq!(read.len(), 2);
        assert_eq!(read[A], Start { at: "2026-11-04T07:00:00+01:00".into(), session: S2.into() });
        assert_eq!(read[B].session, S2);
    }

    #[test]
    fn forgetting_a_start_leaves_the_others() {
        let file = temp("forget");
        stamp_in(&file, A, "2026-11-04T06:00:00+01:00", S1).unwrap();
        stamp_in(&file, B, "2026-11-04T06:05:00+01:00", S2).unwrap();
        forget_in(&file, A).unwrap();
        let read = read_from(&file);
        assert!(!read.contains_key(A));
        assert_eq!(read[B].at, "2026-11-04T06:05:00+01:00");
    }

    #[test]
    fn pruning_drops_only_the_dead_and_writes_only_then() {
        let file = temp("prune");
        stamp_in(&file, A, "2026-11-04T06:00:00+01:00", S1).unwrap();
        stamp_in(&file, B, "2026-11-04T06:05:00+01:00", S2).unwrap();
        let before = std::fs::metadata(&file).unwrap().modified().unwrap();
        prune_in(&file, |_| false).unwrap();
        assert_eq!(std::fs::metadata(&file).unwrap().modified().unwrap(), before);
        prune_in(&file, |url| url == B).unwrap();
        let read = read_from(&file);
        assert_eq!(read.keys().collect::<Vec<_>>(), vec![A]);
    }

    #[test]
    fn a_missing_or_older_file_has_no_start() {
        assert!(read_from(&temp("missing")).is_empty());
        let file = temp("older");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&file, r#"{"https://github.com/o/r/issues/1":"2026-11-04T06:00:00+01:00"}"#).unwrap();
        assert!(read_from(&file).is_empty());
    }
}
