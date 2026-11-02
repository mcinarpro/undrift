//! Let Go (GLOSSARY.md § Let Go): when each Loose End was taken off Home, by Project path, in
//! `~/.local/share/undrift/let-go.json`. A Let Go lasts until the Project's next Activity, which
//! `loose_end` decides; this file only remembers the moment.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Project path → RFC 3339 of the moment it was let go of.
pub type LetGo = BTreeMap<String, String>;

fn file() -> Option<PathBuf> {
    super::data_dir().map(|d| d.join("let-go.json"))
}

pub fn read() -> LetGo {
    file().map(|f| read_from(&f)).unwrap_or_default()
}

/// Let go of `project` at `at`, replacing an earlier Let Go of it.
pub fn stamp(project: &str, at: &str) -> std::io::Result<()> {
    let file = file().ok_or_else(|| std::io::Error::other("no data folder"))?;
    stamp_in(&file, project, at)
}

/// Undo the Let Go of `project`, so its Loose End is back on Home.
pub fn undo(project: &str) -> std::io::Result<()> {
    let file = file().ok_or_else(|| std::io::Error::other("no data folder"))?;
    undo_in(&file, project)
}

/// A missing or unreadable file lets nothing go, so a broken file never hides a Loose End.
fn read_from(file: &Path) -> LetGo {
    std::fs::read_to_string(file).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

fn stamp_in(file: &Path, project: &str, at: &str) -> std::io::Result<()> {
    let mut all = read_from(file);
    all.insert(project.to_owned(), at.to_owned());
    super::write_atomic(file, &serde_json::to_vec_pretty(&all)?)
}

fn undo_in(file: &Path, project: &str) -> std::io::Result<()> {
    let mut all = read_from(file);
    if all.remove(project).is_none() {
        return Ok(());
    }
    super::write_atomic(file, &serde_json::to_vec_pretty(&all)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("undrift-let-go-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir.join("let-go.json")
    }

    #[test]
    fn a_let_go_is_remembered_per_project_and_replaced_by_the_next() {
        let file = temp("stamp");
        stamp_in(&file, "/w/undrift", "2026-11-01T22:00:00+01:00").unwrap();
        stamp_in(&file, "/w/core", "2026-11-01T22:05:00+01:00").unwrap();
        stamp_in(&file, "/w/undrift", "2026-11-02T06:00:00+01:00").unwrap();
        let read = read_from(&file);
        assert_eq!(read.len(), 2);
        assert_eq!(read["/w/undrift"], "2026-11-02T06:00:00+01:00");
        assert_eq!(read["/w/core"], "2026-11-01T22:05:00+01:00");
    }

    #[test]
    fn undoing_a_let_go_brings_back_only_that_project() {
        let file = temp("undo");
        stamp_in(&file, "/w/undrift", "2026-11-02T22:51:41+01:00").unwrap();
        stamp_in(&file, "/w/core", "2026-11-02T22:52:00+01:00").unwrap();
        undo_in(&file, "/w/undrift").unwrap();
        let read = read_from(&file);
        assert!(!read.contains_key("/w/undrift"));
        assert_eq!(read["/w/core"], "2026-11-02T22:52:00+01:00");
    }

    #[test]
    fn a_missing_or_broken_file_lets_nothing_go() {
        let file = temp("broken");
        assert!(read_from(&file).is_empty());
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&file, "not json").unwrap();
        assert!(read_from(&file).is_empty());
    }
}
