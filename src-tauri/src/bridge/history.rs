//! Session history: every session transcript under `~/.claude/projects` written in the last
//! KEEP_DAYS days gives its folder, the local days it had a turn on, and what Claude Code's
//! own resume picker shows of it (title, last prompt preview). One record per file is cached
//! in `~/.local/share/undrift/history.json` keyed by (mtime, size), so a rescan only reads
//! files that changed. Records carry the session's folder; which Project it belongs to is
//! decided later, so a new Hide needs no re-parse.

use super::transcripts::{parse_line, Parsed};
use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// How far back sessions are read: far enough to offer a Parked Project's last Session.
const KEEP_DAYS: u64 = 90;

/// What a transcript says about its session, for the views and Resume.
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionMeta {
    pub id: String,
    /// The user's `/rename` title, else the name Claude Code gave the session, else its AI title.
    pub title: String,
    /// The preview Claude Code keeps for its own resume picker, already cut short by it.
    pub last_prompt: String,
    /// RFC 3339 of the last prompt or reply.
    pub last_activity: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct FileRecord {
    mtime: u64,
    size: u64,
    cwd: String,
    /// Local days (YYYY-MM-DD) with at least one prompt or reply.
    days: BTreeSet<String>,
    meta: SessionMeta,
}

/// One parsed session transcript.
#[derive(Clone)]
pub struct Record {
    pub cwd: String,
    pub days: BTreeSet<String>,
    pub meta: SessionMeta,
}

/// Bump when the record shape changes: an older cache is ignored and rebuilt.
const CACHE_VERSION: u32 = 1;

#[derive(Serialize, Deserialize, Default)]
struct Cache {
    #[serde(default)]
    version: u32,
    files: HashMap<String, FileRecord>,
}

fn cache_path() -> PathBuf {
    dirs::data_dir().unwrap_or_default().join("undrift").join("history.json")
}

fn load_cache() -> Cache {
    let c: Cache = std::fs::read_to_string(cache_path()).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
    if c.version == CACHE_VERSION { c } else { Cache::default() }
}

fn save_cache(c: &Cache) {
    let path = cache_path();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let tmp = path.with_extension("json.tmp");
    if serde_json::to_string(c).ok().and_then(|t| std::fs::write(&tmp, t).ok()).is_some() {
        let _ = std::fs::rename(tmp, path);
    }
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct CwdLine {
    cwd: String,
}

/// The metadata lines Claude Code appends to a session transcript: `{"type":"custom-title",…}`.
#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct MetaLine {
    r#type: String,
    custom_title: String,
    agent_name: String,
    ai_title: String,
    last_prompt: String,
}

fn local_day(ts: &str) -> Option<String> {
    DateTime::parse_from_rfc3339(ts).ok().map(|t| t.with_timezone(&Local).date_naive().to_string())
}

fn parse(path: &Path) -> Option<Record> {
    let f = std::fs::File::open(path).ok()?;
    let mut cwd = String::new();
    let mut days = BTreeSet::new();
    let mut meta = SessionMeta { id: path.file_stem()?.to_string_lossy().into_owned(), ..Default::default() };
    let (mut custom, mut name, mut ai) = (String::new(), String::new(), String::new());
    for line in BufReader::new(f).lines().map_while(Result::ok) {
        if cwd.is_empty() && line.contains("\"cwd\"") {
            if let Ok(l) = serde_json::from_str::<CwdLine>(&line) {
                cwd = l.cwd;
            }
        }
        // Metadata lines start with their type, while message lines start with parentUuid.
        if line.starts_with("{\"type\":\"") {
            if let Ok(m) = serde_json::from_str::<MetaLine>(&line) {
                match m.r#type.as_str() {
                    "custom-title" => custom = m.custom_title,
                    "agent-name" => name = m.agent_name,
                    "ai-title" => ai = m.ai_title,
                    "last-prompt" => meta.last_prompt = m.last_prompt,
                    _ => {}
                }
            }
        }
        let ts = match parse_line(&line) {
            Some(Parsed::Prompt { ts } | Parsed::Reply { ts }) => ts,
            None => continue,
        };
        if let Some(day) = local_day(&ts) {
            days.insert(day);
        }
        if ts > meta.last_activity {
            meta.last_activity = ts;
        }
    }
    if cwd.is_empty() || meta.last_activity.is_empty() {
        return None; // A transcript with no turn yet has nothing to resume.
    }
    meta.title = [custom, name, ai].into_iter().find(|t| !t.trim().is_empty()).unwrap_or_default();
    Some(Record { cwd, days, meta })
}

/// Session transcripts only: sub-agents live in `<session>/subagents/` and are skipped.
fn transcripts() -> Vec<PathBuf> {
    let Some(root) = dirs::home_dir().map(|h| h.join(".claude").join("projects")) else { return Vec::new() };
    let Ok(projects) = std::fs::read_dir(root) else { return Vec::new() };
    projects
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|p| std::fs::read_dir(p.path()).ok())
        .flat_map(|entries| entries.flatten().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "jsonl"))
        .collect()
}

/// Rescan what changed and return the records. Slow the first time, cheap after.
pub fn scan() -> Vec<Record> {
    let mut cache = load_cache();
    let mut live: HashMap<String, FileRecord> = HashMap::new();
    let cutoff = std::time::SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0).saturating_sub(KEEP_DAYS * 86_400);
    for path in transcripts() {
        let key = path.to_string_lossy().into_owned();
        let Ok(meta) = std::fs::metadata(&path) else { continue };
        let mtime = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
        if mtime < cutoff {
            continue;
        }
        let size = meta.len();
        if let Some(r) = cache.files.get(&key).filter(|r| r.mtime == mtime && r.size == size) {
            live.insert(key, r.clone());
            continue;
        }
        if let Some(r) = parse(&path) {
            live.insert(key, FileRecord { mtime, size, cwd: r.cwd, days: r.days, meta: r.meta });
        }
    }
    cache.files = live;
    cache.version = CACHE_VERSION;
    save_cache(&cache);
    cache.files.into_values().map(|r| Record { cwd: r.cwd, days: r.days, meta: r.meta }).collect()
}
