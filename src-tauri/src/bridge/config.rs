//! Which folders are Projects (GLOSSARY.md § Discovery): every git checkout directly under a
//! root (`~/workspace` by default), plus every folder a Session ran in that is not inside one.
//! Hides take Projects out; Focus is read here and written by `set_focus`, from the Project page;
//! Today (GLOSSARY.md § Today) the same way, by `set_today`, from the Board.
//! The settings live in `~/.config/undrift/config.json`, reloaded when the file's mtime changes.

use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// How many Projects Focus holds (GLOSSARY.md § Focus): one to four – a Lane each on the Board,
/// which is as many as a window shows at once – so it stays a choice.
pub const MAX_FOCUS: usize = 4;

#[derive(Deserialize, Clone, PartialEq, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Config {
    /// Folders whose direct git children are Projects; `~` is expanded.
    pub roots: Vec<String>,
    /// Absolute paths left out of every view. Exact paths, never patterns.
    pub hides: Vec<String>,
    /// The Projects Mehmet chose to push, in the order he placed them.
    pub focus: Vec<Focus>,
    /// The Issues Mehmet pulled into Today, in the order he pulled them.
    pub today: Vec<Today>,
    /// The terminal Resume, New Session and Start open; empty takes `$TERMINAL`, then the first
    /// one found on the PATH. Linux only – Windows opens Windows Terminal.
    pub terminal: String,
}

impl Default for Config {
    fn default() -> Self {
        Config { roots: vec!["~/workspace".into()], hides: Vec::new(), focus: Vec::new(), today: Vec::new(), terminal: String::new() }
    }
}

/// A Project put in Focus (GLOSSARY.md § Focus).
#[derive(Deserialize, Clone, PartialEq, Debug, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Focus {
    /// Absolute path of the Project.
    pub path: String,
    /// RFC 3339 of the moment it was put in Focus.
    pub since: String,
}

/// An Issue pulled into Today (GLOSSARY.md § Today), by its URL: the same for two checkouts of one
/// repository, and the same on another machine, which a number alone would not be.
#[derive(Deserialize, Clone, PartialEq, Debug, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Today {
    pub url: String,
    /// RFC 3339 of the moment it was pulled.
    pub since: String,
}

impl Config {
    /// The Hides as paths, compared whole: a Hide never takes out a folder inside it.
    pub fn hidden(&self) -> BTreeSet<PathBuf> {
        self.hides.iter().map(|h| expand(h)).collect()
    }
}

fn path() -> PathBuf {
    dirs::config_dir().unwrap_or_default().join("undrift").join("config.json")
}

pub fn expand(p: &str) -> PathBuf {
    match p.strip_prefix('~') {
        Some(rest) => dirs::home_dir().unwrap_or_default().join(rest.trim_start_matches('/')),
        None => PathBuf::from(p),
    }
}

/// Puts `project` in Focus at `since`, or takes it out with `None` (GLOSSARY.md § Focus). The
/// bridge sees the file's new mtime on its next tick, as after a hand edit.
pub fn set_focus(project: &Path, since: Option<&str>) -> std::io::Result<()> {
    set_focus_in(&path(), project, since)
}

/// Edited as plain JSON, so the keys this module does not read survive the write, and the path
/// is stored as `~/…` so the file travels between machines; it is matched through `expand`, so an
/// absolute path written by hand is found too. A
/// Project already in Focus keeps the moment it was chosen; the array's order is the order of
/// choosing, so a new one goes last.
fn set_focus_in(file: &Path, project: &Path, since: Option<&str>) -> std::io::Result<()> {
    let mut root: Map<String, Value> = read_root(file);
    let mut focus = match root.remove("focus") {
        Some(Value::Array(focus)) => focus,
        _ => Vec::new(),
    };
    let at = focus.iter().position(|f| f.get("path").and_then(Value::as_str).is_some_and(|p| expand(p) == project));
    match (since, at) {
        (Some(_), Some(_)) | (None, None) => return Ok(()),
        (Some(since), None) => {
            if focus.len() >= MAX_FOCUS {
                return Err(std::io::Error::other(format!("Focus holds {MAX_FOCUS} Projects at most")));
            }
            focus.push(json!({ "path": short(project), "since": since }));
        }
        (None, Some(i)) => {
            focus.remove(i);
        }
    }
    root.insert("focus".into(), Value::Array(focus));
    super::write_atomic(file, &serde_json::to_vec_pretty(&root)?)
}

/// Pulls the Issue into Today at `since`, or takes it out with `None` (GLOSSARY.md § Today). The
/// bridge sees the file's new mtime on its next tick, as for Focus.
pub fn set_today(url: &str, since: Option<&str>) -> std::io::Result<()> {
    set_today_in(&path(), url, since)
}

/// Edited as plain JSON like `set_focus_in`, so the other keys survive. An Issue already in keeps
/// the moment it was pulled; the array's order is the order of pulling, so a new one goes last.
fn set_today_in(file: &Path, url: &str, since: Option<&str>) -> std::io::Result<()> {
    let mut root: Map<String, Value> = read_root(file);
    let mut today = today_of(&mut root);
    let at = today.iter().position(|t| t.get("url").and_then(Value::as_str) == Some(url));
    match (since, at) {
        (Some(_), Some(_)) | (None, None) => return Ok(()),
        (Some(since), None) => today.push(json!({ "url": url, "since": since })),
        (None, Some(i)) => {
            today.remove(i);
        }
    }
    root.insert("today".into(), Value::Array(today));
    super::write_atomic(file, &serde_json::to_vec_pretty(&root)?)
}

/// Takes out of Today every Issue `dead` says is no longer open, writing only when one was. The
/// bridge never writes at build time, so this runs after a write Mehmet asked for.
pub fn prune_today(dead: impl Fn(&str) -> bool) -> std::io::Result<()> {
    prune_today_in(&path(), dead)
}

fn prune_today_in(file: &Path, dead: impl Fn(&str) -> bool) -> std::io::Result<()> {
    let mut root: Map<String, Value> = read_root(file);
    let today = today_of(&mut root);
    let kept: Vec<Value> = today.iter().filter(|t| !t.get("url").and_then(Value::as_str).is_some_and(&dead)).cloned().collect();
    if kept.len() == today.len() {
        return Ok(());
    }
    root.insert("today".into(), Value::Array(kept));
    super::write_atomic(file, &serde_json::to_vec_pretty(&root)?)
}

/// The `today` array taken out of the file's JSON, empty when missing or not an array.
fn today_of(root: &mut Map<String, Value>) -> Vec<Value> {
    match root.remove("today") {
        Some(Value::Array(today)) => today,
        _ => Vec::new(),
    }
}

/// The file as plain JSON; a missing or broken file is the defaults, as `reload_if_changed`
/// reads it.
fn read_root(file: &Path) -> Map<String, Value> {
    std::fs::read_to_string(file).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

/// `~/…` for a path under the home folder, the path itself otherwise.
pub fn short(path: &Path) -> String {
    match dirs::home_dir().and_then(|h| path.strip_prefix(h).ok().map(Path::to_path_buf)) {
        Some(rest) if rest.as_os_str().is_empty() => "~".into(),
        Some(rest) => format!("~/{}", rest.display()),
        None => path.display().to_string(),
    }
}

pub struct Settings {
    path: PathBuf,
    mtime: Option<SystemTime>,
    config: Config,
}

impl Settings {
    pub fn new() -> Self {
        let mut s = Settings { path: path(), mtime: None, config: Config::default() };
        s.reload_if_changed();
        s
    }

    /// True when the file changed since the last call. A missing or unreadable file means the
    /// defaults, so a typo in the file never stops the bridge.
    pub fn reload_if_changed(&mut self) -> bool {
        let mtime = std::fs::metadata(&self.path).and_then(|m| m.modified()).ok();
        if mtime == self.mtime {
            return false;
        }
        self.mtime = mtime;
        self.config = std::fs::read_to_string(&self.path)
            .ok()
            .and_then(|t| serde_json::from_str(&t).map_err(|e| eprintln!("config.json: {e}")).ok())
            .unwrap_or_default();
        true
    }

    pub fn config(&self) -> &Config {
        &self.config
    }
}

/// The git checkouts directly under each root, sorted.
pub fn discover(config: &Config) -> BTreeSet<PathBuf> {
    config
        .roots
        .iter()
        .filter_map(|r| std::fs::read_dir(expand(r)).ok())
        .flat_map(|entries| entries.flatten().map(|e| e.path()))
        .filter(|p| p.join(".git").exists())
        .collect()
}

/// The Project a Session folder belongs to: the discovered checkout it sits in, else the folder
/// itself.
pub fn project_for(cwd: &Path, discovered: &BTreeSet<PathBuf>) -> PathBuf {
    cwd.ancestors().find(|a| discovered.contains(*a)).unwrap_or(cwd).to_path_buf()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_session_belongs_to_the_checkout_it_sits_in() {
        let discovered: BTreeSet<PathBuf> = ["/w/undrift", "/w/core"].iter().map(PathBuf::from).collect();
        assert_eq!(project_for(Path::new("/w/undrift/src-tauri"), &discovered), PathBuf::from("/w/undrift"));
        assert_eq!(project_for(Path::new("/w/core"), &discovered), PathBuf::from("/w/core"));
        assert_eq!(project_for(Path::new("/home/m/.dotfiles"), &discovered), PathBuf::from("/home/m/.dotfiles"));
    }

    #[test]
    fn a_hide_is_an_exact_path() {
        let config = Config { hides: vec!["~/workspace/old".into()], ..Default::default() };
        let hidden = config.hidden();
        let home = dirs::home_dir().unwrap();
        assert!(hidden.contains(&home.join("workspace/old")));
        assert!(!hidden.contains(&home.join("workspace/old/sub")));
        assert!(!hidden.contains(&home.join("workspace")));
    }

    #[test]
    fn a_missing_field_takes_its_default() {
        let config: Config = serde_json::from_str(r#"{"hides":["/x"]}"#).unwrap();
        assert_eq!(config.roots, vec!["~/workspace".to_string()]);
        assert_eq!(config.hides, vec!["/x".to_string()]);
        assert_eq!(config.terminal, "");
    }

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("undrift-config-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir.join("config.json")
    }

    fn focus_of(file: &Path) -> Vec<(String, String)> {
        let root: Value = serde_json::from_str(&std::fs::read_to_string(file).unwrap()).unwrap();
        root["focus"].as_array().unwrap().iter().map(|f| (f["path"].as_str().unwrap().to_owned(), f["since"].as_str().unwrap().to_owned())).collect()
    }

    #[test]
    fn focus_is_put_kept_and_left_in_the_order_chosen() {
        let file = temp("focus");
        let home = dirs::home_dir().unwrap();
        let undrift = home.join("workspace/undrift");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&file, json!({ "terminal": "", "focus": [{ "path": home.join("workspace/vps").to_str().unwrap(), "since": "2026-11-01T06:00:00+01:00" }] }).to_string()).unwrap();
        set_focus_in(&file, &undrift, Some("2026-11-03T06:00:00+01:00")).unwrap();
        set_focus_in(&file, &undrift, Some("2026-11-04T06:00:00+01:00")).unwrap();
        assert_eq!(focus_of(&file), vec![(home.join("workspace/vps").to_str().unwrap().to_owned(), "2026-11-01T06:00:00+01:00".into()), ("~/workspace/undrift".into(), "2026-11-03T06:00:00+01:00".into())]);
        set_focus_in(&file, &home.join("workspace/vps"), None).unwrap();
        assert_eq!(focus_of(&file), vec![("~/workspace/undrift".into(), "2026-11-03T06:00:00+01:00".into())]);
        let root: Value = serde_json::from_str(&std::fs::read_to_string(&file).unwrap()).unwrap();
        assert_eq!(root["terminal"], "");
    }

    fn today_of_file(file: &Path) -> Vec<(String, String)> {
        let root: Value = serde_json::from_str(&std::fs::read_to_string(file).unwrap()).unwrap();
        root["today"].as_array().unwrap().iter().map(|t| (t["url"].as_str().unwrap().to_owned(), t["since"].as_str().unwrap().to_owned())).collect()
    }

    #[test]
    fn today_is_pulled_kept_and_taken_out_by_url() {
        let file = temp("today");
        let a = "https://github.com/mcinarpro/undrift/issues/22";
        let b = "https://github.com/mcinarpro/undrift/issues/19";
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&file, json!({ "terminal": "ghostty", "focus": [{ "path": "~/workspace/undrift", "since": "2026-11-01T06:00:00+01:00" }] }).to_string()).unwrap();
        set_today_in(&file, a, Some("2026-11-04T06:00:00+01:00")).unwrap();
        set_today_in(&file, b, Some("2026-11-04T06:05:00+01:00")).unwrap();
        set_today_in(&file, a, Some("2026-11-04T07:00:00+01:00")).unwrap();
        assert_eq!(today_of_file(&file), vec![(a.into(), "2026-11-04T06:00:00+01:00".into()), (b.into(), "2026-11-04T06:05:00+01:00".into())]);
        set_today_in(&file, a, None).unwrap();
        assert_eq!(today_of_file(&file), vec![(b.into(), "2026-11-04T06:05:00+01:00".into())]);
        let root: Value = serde_json::from_str(&std::fs::read_to_string(&file).unwrap()).unwrap();
        assert_eq!(root["terminal"], "ghostty");
        assert_eq!(root["focus"].as_array().unwrap().len(), 1);
        let config: Config = serde_json::from_value(root).unwrap();
        assert_eq!(config.today, vec![Today { url: b.into(), since: "2026-11-04T06:05:00+01:00".into() }]);
    }

    #[test]
    fn pruning_today_drops_only_the_dead_and_writes_only_then() {
        let file = temp("today-prune");
        let a = "https://github.com/mcinarpro/undrift/issues/22";
        let b = "https://github.com/mcinarpro/undrift/issues/19";
        set_today_in(&file, a, Some("2026-11-04T06:00:00+01:00")).unwrap();
        set_today_in(&file, b, Some("2026-11-04T06:05:00+01:00")).unwrap();
        let before = std::fs::metadata(&file).unwrap().modified().unwrap();
        prune_today_in(&file, |_| false).unwrap();
        assert_eq!(std::fs::metadata(&file).unwrap().modified().unwrap(), before);
        prune_today_in(&file, |url| url == a).unwrap();
        assert_eq!(today_of_file(&file), vec![(b.into(), "2026-11-04T06:05:00+01:00".into())]);
    }

    #[test]
    fn focus_holds_four_projects_at_most() {
        let file = temp("focus-max");
        let home = dirs::home_dir().unwrap();
        for name in ["a", "b", "c", "d"] {
            set_focus_in(&file, &home.join(name), Some("2026-11-03T06:00:00+01:00")).unwrap();
        }
        assert!(set_focus_in(&file, &home.join("e"), Some("2026-11-03T06:00:00+01:00")).is_err());
        assert_eq!(focus_of(&file).len(), MAX_FOCUS);
    }

    #[test]
    fn short_puts_a_tilde_for_home() {
        let home = dirs::home_dir().unwrap();
        assert_eq!(short(&home), "~");
        assert_eq!(short(&home.join("workspace/undrift")), "~/workspace/undrift");
        assert_eq!(short(Path::new("/etc")), "/etc");
    }
}
