//! Open Sessions: `~/.claude/sessions/<pid>.json`, one file per running `claude`, written by
//! Claude Code itself. Only the fields Undrift needs are read; a missing field never drops a
//! Session (`serde(default)`).

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct SessionFile {
    session_id: String,
    cwd: String,
    status: String,
    entrypoint: String,
    /// The process start time, in clock ticks since boot, as `/proc/<pid>/stat` gives it.
    proc_start: String,
    status_updated_at: u64,
}

/// What an open Session is doing (GLOSSARY.md § Status). `Done` means it finished its turn; the
/// window tells waiting from quiet on its own clock, so a Session turns quiet without a new event.
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Busy,
    Done,
}

impl Status {
    /// `shell` is a `!` command running inside the Session, which is work on its turn. Claude Code
    /// writes `idle` for a finished turn, and a value it adds later counts as finished rather than
    /// dropping the Session.
    fn from_file(s: &str) -> Self {
        match s {
            "busy" | "shell" => Status::Busy,
            _ => Status::Done,
        }
    }
}

#[derive(Clone, PartialEq, Debug)]
pub struct Session {
    pub id: String,
    pub cwd: String,
    pub status: Status,
    /// `cli` for a terminal, `claude-desktop` for the desktop app.
    pub entrypoint: String,
    /// When the status last changed, in Unix milliseconds.
    pub status_since: u64,
}

fn dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("sessions"))
}

/// Every Session whose process is still the one that wrote its file, sorted by id.
pub fn scan() -> Vec<Session> {
    let Some(dir) = dir() else { return Vec::new() };
    let Ok(entries) = std::fs::read_dir(&dir) else { return Vec::new() };
    let mut out: Vec<Session> = entries.flatten().filter_map(|e| read(&e.path())).collect();
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

fn read(path: &Path) -> Option<Session> {
    if path.extension()? != "json" {
        return None; // The <pid>.<hash>.key files live in the same directory.
    }
    let pid: u32 = path.file_stem()?.to_str()?.parse().ok()?;
    let text = std::fs::read_to_string(path).ok()?;
    parse(&text, |start| alive(pid, start))
}

/// A Session from its file, kept only when `alive` confirms its process.
fn parse(text: &str, alive: impl Fn(&str) -> bool) -> Option<Session> {
    let f: SessionFile = serde_json::from_str(text).ok()?;
    if f.session_id.is_empty() || f.cwd.is_empty() || !alive(&f.proc_start) {
        return None;
    }
    Some(Session {
        id: f.session_id,
        cwd: f.cwd,
        status: Status::from_file(&f.status),
        entrypoint: f.entrypoint,
        status_since: f.status_updated_at,
    })
}

/// The process exists and started when the file says: a crashed `claude` leaves its file behind,
/// and its pid can be reused by an unrelated process. A file without `procStart` is trusted on
/// the pid alone.
#[cfg(target_os = "linux")]
fn alive(pid: u32, proc_start: &str) -> bool {
    match std::fs::read_to_string(format!("/proc/{pid}/stat")) {
        Ok(stat) => proc_start.is_empty() || start_time(&stat) == Some(proc_start),
        Err(_) => false,
    }
}

#[cfg(not(target_os = "linux"))]
fn alive(_pid: u32, _proc_start: &str) -> bool {
    true
}

/// Field 22 of `/proc/<pid>/stat`. The command name in field 2 sits in parentheses and may hold
/// spaces or parentheses itself, so the count starts after the last `)`, at field 3.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn start_time(stat: &str) -> Option<&str> {
    stat.rsplit_once(')')?.1.split_whitespace().nth(22 - 3)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FILE: &str = r#"{"pid":3725,"sessionId":"abc","cwd":"/w/undrift","status":"shell","entrypoint":"cli","procStart":"8436","statusUpdatedAt":1793651642609,"kind":"interactive"}"#;

    #[test]
    fn reads_status_entrypoint_and_since() {
        let s = parse(FILE, |_| true).unwrap();
        assert_eq!(s.id, "abc");
        assert_eq!(s.cwd, "/w/undrift");
        assert_eq!(s.status, Status::Busy); // shell counts as busy
        assert_eq!(s.entrypoint, "cli");
        assert_eq!(s.status_since, 1793651642609);
    }

    #[test]
    fn idle_and_unknown_statuses_are_done() {
        assert_eq!(Status::from_file("idle"), Status::Done);
        assert_eq!(Status::from_file("busy"), Status::Busy);
        assert_eq!(Status::from_file("thinking-hard"), Status::Done);
    }

    #[test]
    fn a_dead_process_drops_the_session() {
        assert!(parse(FILE, |start| start == "999").is_none());
        assert!(parse(r#"{"sessionId":"","cwd":"/w"}"#, |_| true).is_none());
        assert!(parse("not json", |_| true).is_none());
    }

    #[test]
    fn start_time_is_field_22_even_with_a_tricky_name() {
        let stat = "3725 (cla (ude) x) S 1 3725 3725 0 -1 4194560 1 2 3 4 5 6 7 8 20 0 1 0 8436 1000 2";
        assert_eq!(start_time(stat), Some("8436"));
        assert_eq!(start_time("garbage"), None);
    }
}
