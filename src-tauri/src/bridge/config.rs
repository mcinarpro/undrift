//! Which folders are Projects (GLOSSARY.md § Discovery): every git checkout directly under a
//! root (`~/workspace` by default), plus every folder a Session ran in that is not inside one.
//! Hides take Projects out; Focus and Areas are read here and written by nothing yet. The
//! settings live in `~/.config/undrift/config.json`, reloaded when the file's mtime changes.

use serde::Deserialize;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

#[derive(Deserialize, Clone, PartialEq, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Config {
    /// Folders whose direct git children are Projects; `~` is expanded.
    pub roots: Vec<String>,
    /// Absolute paths left out of every view. Exact paths, never patterns.
    pub hides: Vec<String>,
    /// The Projects Mehmet chose to push, in the order he placed them.
    pub focus: Vec<Focus>,
    /// The Areas, in the order their cards show. A Project sits in one Area at most.
    pub areas: Vec<Area>,
}

impl Default for Config {
    fn default() -> Self {
        Config { roots: vec!["~/workspace".into()], hides: Vec::new(), focus: Vec::new(), areas: Vec::new() }
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

/// A theme Projects are filed under (GLOSSARY.md § Area).
#[derive(Deserialize, Clone, PartialEq, Debug, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Area {
    pub name: String,
    /// The colour that tints the Area's card and hub.
    pub color: String,
    /// Absolute paths of its Projects.
    pub projects: Vec<String>,
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
    }

    #[test]
    fn short_puts_a_tilde_for_home() {
        let home = dirs::home_dir().unwrap();
        assert_eq!(short(&home), "~");
        assert_eq!(short(&home.join("workspace/undrift")), "~/workspace/undrift");
        assert_eq!(short(Path::new("/etc")), "/etc");
    }
}
