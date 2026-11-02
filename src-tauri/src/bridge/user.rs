//! The NavUser: the GitHub account `gh` is signed in to, read with `gh api user`, and its avatar,
//! fetched once per avatar URL. Both are cached in `~/.local/share/undrift/` so the sidebar shows
//! them offline and on the first paint.

use super::{data_dir, gh, write_atomic};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Duration;

/// What the window shows of the account (src/types.ts `NavUser`).
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NavUser {
    pub login: String,
    /// The profile's name, or the login when the profile has none.
    pub name: String,
    pub profile_url: String,
}

/// The cache file: the user, and the avatar URL the cached image came from – empty while no image
/// was saved, so a failed download is tried again on the next start.
#[derive(Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Cached {
    user: NavUser,
    avatar_url: String,
}

#[derive(Deserialize)]
struct ApiUser {
    login: String,
    name: Option<String>,
    html_url: String,
    avatar_url: String,
}

/// The avatar is drawn at 32 px, so 64 px covers a 2× screen.
const AVATAR_SIZE: &str = "64";
const AVATAR_TIMEOUT: Duration = Duration::from_secs(10);
/// The only host an avatar is fetched from: the URL comes from GitHub's answer, and the privacy
/// contract allows GitHub alone.
const AVATAR_HOST: &str = "https://avatars.githubusercontent.com/";

fn load(dir: &Path) -> Option<Cached> {
    serde_json::from_str(&std::fs::read_to_string(dir.join("user.json")).ok()?).ok()
}

/// The user from the cache; `None` until a first `gh api user` succeeded.
pub fn cached() -> Option<NavUser> {
    load(&data_dir()?).map(|c| c.user)
}

/// The cached avatar image, as GitHub served it.
pub fn avatar() -> Option<Vec<u8>> {
    std::fs::read(data_dir()?.join("avatar")).ok()
}

/// Ask GitHub who is signed in, and fetch the avatar when its URL changed or the file is gone.
/// Returns the fresh user, or `None` when `gh` failed, in which case the cache stays as it was.
pub fn refresh() -> Option<NavUser> {
    let (user, avatar_url) = parse(&gh::run(&["api", "user"])?)?;
    let dir = data_dir()?;
    let had = load(&dir);
    let file = dir.join("avatar");
    let mut saved_url = had.as_ref().map(|c| c.avatar_url.clone()).filter(|_| file.exists()).unwrap_or_default();
    if saved_url != avatar_url {
        match avatar_request(&avatar_url).and_then(|url| download(&url)) {
            Some(bytes) if write(&file, &bytes) => saved_url = avatar_url,
            _ => eprintln!("nav user: the avatar could not be fetched"),
        }
    }
    let next = Cached { user: user.clone(), avatar_url: saved_url };
    if had.as_ref() != Some(&next) {
        write(&dir.join("user.json"), serde_json::to_string(&next).ok()?.as_bytes());
    }
    Some(user)
}

fn parse(json: &str) -> Option<(NavUser, String)> {
    let u: ApiUser = serde_json::from_str(json).ok()?;
    let name = u.name.filter(|n| !n.trim().is_empty()).unwrap_or_else(|| u.login.clone());
    Some((NavUser { login: u.login, name, profile_url: u.html_url }, u.avatar_url))
}

/// GitHub's avatar URL with the size the sidebar needs; `None` for any other host.
fn avatar_request(url: &str) -> Option<String> {
    url.starts_with(AVATAR_HOST).then(|| {
        let sep = if url.contains('?') { '&' } else { '?' };
        format!("{url}{sep}s={AVATAR_SIZE}")
    })
}

fn download(url: &str) -> Option<Vec<u8>> {
    let agent: ureq::Agent = ureq::Agent::config_builder().timeout_global(Some(AVATAR_TIMEOUT)).build().into();
    agent.get(url).call().ok()?.body_mut().read_to_vec().ok()
}

/// Whether the file was written; a failure is logged, and the cache keeps what it had.
fn write(path: &Path, bytes: &[u8]) -> bool {
    write_atomic(path, bytes).map_err(|e| eprintln!("nav user: {}: {e}", path.display())).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_login_name_profile_and_avatar() {
        let json = r#"{"login":"mcinarpro","name":"Mehmet Cinar","html_url":"https://github.com/mcinarpro","avatar_url":"https://avatars.githubusercontent.com/u/99870765?v=4","id":99870765}"#;
        let (user, avatar) = parse(json).unwrap();
        assert_eq!(user, NavUser { login: "mcinarpro".into(), name: "Mehmet Cinar".into(), profile_url: "https://github.com/mcinarpro".into() });
        assert_eq!(avatar, "https://avatars.githubusercontent.com/u/99870765?v=4");
    }

    #[test]
    fn a_profile_without_a_name_shows_the_login() {
        let json = r#"{"login":"someone","name":null,"html_url":"https://github.com/someone","avatar_url":"https://a/u/1"}"#;
        assert_eq!(parse(json).unwrap().0.name, "someone");
        assert!(parse("not json").is_none());
    }

    #[test]
    fn the_avatar_comes_from_github_at_its_size() {
        assert_eq!(avatar_request("https://avatars.githubusercontent.com/u/1?v=4").as_deref(), Some("https://avatars.githubusercontent.com/u/1?v=4&s=64"));
        assert_eq!(avatar_request("https://avatars.githubusercontent.com/u/1").as_deref(), Some("https://avatars.githubusercontent.com/u/1?s=64"));
        assert_eq!(avatar_request("https://example.com/avatars.githubusercontent.com/u/1"), None);
    }
}
