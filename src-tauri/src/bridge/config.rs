//! Which folders are Projects (GLOSSARY.md § Discovery): every git checkout directly under a
//! root (`~/workspace` by default), plus every folder a Session ran in that is not inside one.
//! Hides take Projects out; Focus and Areas are read here and written by `set_focus` and
//! `set_area`, from the Project page. The settings live in `~/.config/undrift/config.json`,
//! reloaded when the file's mtime changes.

use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// The Area palette (DESIGN.md § Colour, `--ud-area-*`): the only colours an Area can take.
pub const AREA_COLORS: [&str; 5] = ["purple", "green", "pink", "teal", "gray"];

/// How many Projects Focus holds (GLOSSARY.md § Focus): one to three, so it stays a choice.
pub const MAX_FOCUS: usize = 3;

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
    /// The terminal Resume, New Session and Start open; empty takes `$TERMINAL`, then the first
    /// one found on the PATH. Linux only – Windows opens Windows Terminal.
    pub terminal: String,
}

impl Default for Config {
    fn default() -> Self {
        Config { roots: vec!["~/workspace".into()], hides: Vec::new(), focus: Vec::new(), areas: Vec::new(), terminal: String::new() }
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

/// Files `project` under the Area `area` – its name and colour – or under none (GLOSSARY.md
/// § Area). The bridge sees the file's new mtime on its next tick, as after a hand edit.
pub fn set_area(project: &Path, area: Option<(&str, &str)>) -> std::io::Result<()> {
    set_area_in(&path(), project, area)
}

/// The file is edited as plain JSON, so the keys this module does not read survive the write. The
/// Project's path is stored as `~/…`, so the file travels between machines; it is matched through
/// `expand`, so an absolute path written by hand is found too.
fn set_area_in(file: &Path, project: &Path, area: Option<(&str, &str)>) -> std::io::Result<()> {
    if let Some((name, color)) = area {
        if name.trim().is_empty() {
            return Err(std::io::Error::other("an Area needs a name"));
        }
        if !AREA_COLORS.contains(&color) {
            return Err(std::io::Error::other(format!("not an Area colour: {color}")));
        }
    }
    let mut root = read_root(file);
    let mut areas = match root.remove("areas") {
        Some(Value::Array(areas)) => areas,
        _ => Vec::new(),
    };
    // A Project sits in one Area at most: it leaves every Area before it joins one.
    for a in areas.iter_mut() {
        if let Some(Value::Array(projects)) = a.get_mut("projects") {
            projects.retain(|p| p.as_str().is_none_or(|p| expand(p) != project));
        }
    }
    if let Some((name, color)) = area {
        let stored = Value::String(short(project));
        let named = |a: &Value| a.get("name").and_then(Value::as_str) == Some(name);
        match areas.iter().position(named) {
            Some(i) => match areas[i].get_mut("projects") {
                Some(Value::Array(projects)) => projects.push(stored),
                _ => {
                    if let Some(a) = areas[i].as_object_mut() {
                        a.insert("projects".into(), Value::Array(vec![stored]));
                    }
                }
            },
            None => areas.push(json!({ "name": name, "color": color, "projects": [stored] })),
        }
    }
    // An Area exists while it holds a Project, so an emptied one leaves the file.
    areas.retain(|a| a.get("projects").and_then(Value::as_array).is_some_and(|p| !p.is_empty()));
    root.insert("areas".into(), Value::Array(areas));
    super::write_atomic(file, &serde_json::to_vec_pretty(&root)?)
}

/// Puts `project` in Focus at `since`, or takes it out with `None` (GLOSSARY.md § Focus). The
/// bridge sees the file's new mtime on its next tick, as after a hand edit.
pub fn set_focus(project: &Path, since: Option<&str>) -> std::io::Result<()> {
    set_focus_in(&path(), project, since)
}

/// Edited as `set_area_in` does, so the other keys survive and the path is stored as `~/…`. A
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

    fn areas_of(file: &Path) -> Vec<(String, Vec<String>)> {
        let root: Value = serde_json::from_str(&std::fs::read_to_string(file).unwrap()).unwrap();
        root["areas"]
            .as_array()
            .unwrap()
            .iter()
            .map(|a| (a["name"].as_str().unwrap().to_owned(), a["projects"].as_array().unwrap().iter().map(|p| p.as_str().unwrap().to_owned()).collect()))
            .collect()
    }

    #[test]
    fn a_project_moves_between_areas_and_an_emptied_area_leaves() {
        let file = temp("move");
        let home = dirs::home_dir().unwrap();
        let undrift = home.join("workspace/undrift");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(
            &file,
            json!({
                "terminal": "", "notify": true,
                "areas": [
                    { "name": "OPS", "color": "gray", "projects": [undrift.to_str().unwrap(), "~/workspace/vps"] },
                    { "name": "Studies", "color": "teal", "projects": ["~/workspace/electricity-study"] }
                ]
            })
            .to_string(),
        )
        .unwrap();
        set_area_in(&file, &undrift, Some(("Studies", "teal"))).unwrap();
        assert_eq!(
            areas_of(&file),
            vec![("OPS".into(), vec!["~/workspace/vps".into()]), ("Studies".into(), vec!["~/workspace/electricity-study".into(), "~/workspace/undrift".into()])]
        );
        set_area_in(&file, &home.join("workspace/vps"), None).unwrap();
        assert_eq!(areas_of(&file), vec![("Studies".into(), vec!["~/workspace/electricity-study".into(), "~/workspace/undrift".into()])]);
        let root: Value = serde_json::from_str(&std::fs::read_to_string(&file).unwrap()).unwrap();
        assert_eq!(root["terminal"], "");
        assert_eq!(root["notify"], true);
    }

    #[test]
    fn a_new_area_is_appended_with_its_colour_even_without_a_file() {
        let file = temp("new");
        let undrift = dirs::home_dir().unwrap().join("workspace/undrift");
        set_area_in(&file, &undrift, Some(("Tools", "teal"))).unwrap();
        assert_eq!(areas_of(&file), vec![("Tools".into(), vec!["~/workspace/undrift".into()])]);
        let root: Value = serde_json::from_str(&std::fs::read_to_string(&file).unwrap()).unwrap();
        assert_eq!(root["areas"][0]["color"], "teal");
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

    #[test]
    fn focus_holds_three_projects_at_most() {
        let file = temp("focus-max");
        let home = dirs::home_dir().unwrap();
        for name in ["a", "b", "c"] {
            set_focus_in(&file, &home.join(name), Some("2026-11-03T06:00:00+01:00")).unwrap();
        }
        assert!(set_focus_in(&file, &home.join("d"), Some("2026-11-03T06:00:00+01:00")).is_err());
        assert_eq!(focus_of(&file).len(), 3);
    }

    #[test]
    fn an_empty_name_or_a_colour_off_the_palette_is_refused() {
        let file = temp("refused");
        let undrift = dirs::home_dir().unwrap().join("workspace/undrift");
        assert!(set_area_in(&file, &undrift, Some((" ", "teal"))).is_err());
        assert!(set_area_in(&file, &undrift, Some(("Tools", "blue"))).is_err());
        assert!(!file.exists());
    }

    #[test]
    fn short_puts_a_tilde_for_home() {
        let home = dirs::home_dir().unwrap();
        assert_eq!(short(&home), "~");
        assert_eq!(short(&home.join("workspace/undrift")), "~/workspace/undrift");
        assert_eq!(short(Path::new("/etc")), "/etc");
    }
}
