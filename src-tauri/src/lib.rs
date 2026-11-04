mod bridge;
mod terminal;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};

/// Latest list and what it holds, so the window has something to show before the first event;
/// `None` until the bridge built its first one.
#[tauri::command]
async fn projects_now(shared: tauri::State<'_, bridge::Shared>) -> Result<Option<bridge::Snapshot>, ()> {
    Ok(shared.lock().ok().and_then(|l| l.projects.clone().map(|projects| bridge::Snapshot { projects, read: l.read, answered: false })))
}

/// The Project the window names, from the bridge's own list: the window never chooses the folder
/// a terminal opens in.
fn project(shared: &bridge::Shared, path: &str) -> Result<bridge::Project, String> {
    let latest = shared.lock().map_err(|_| "bridge state is poisoned")?;
    latest.projects.iter().flatten().find(|p| p.path == path).cloned().ok_or_else(|| format!("not a Project: {path}"))
}

/// An open Issue of the Project the window names, from the bridge's own list, with its Project.
fn issue(shared: &bridge::Shared, path: &str, number: u32) -> Result<(bridge::Project, bridge::issues::Issue), String> {
    let project = project(shared, path)?;
    let issue = project.issues.iter().find(|i| i.number == number).cloned().ok_or_else(|| format!("not an open Issue of {path}: #{number}"))?;
    Ok((project, issue))
}

/// Takes out of Today and of the Starts every Issue the list knows to be closed: it is among the
/// Issues closed this week, or its repository has open Issues on record and it is not among them.
/// A repository `gh` could not read has none on record, so its intentions are kept. Housekeeping
/// after a write Mehmet asked for, so a failure here is logged and never fails his action.
fn prune(shared: &bridge::Shared) {
    let projects = shared.lock().ok().and_then(|l| l.projects.clone()).unwrap_or_default();
    let dead = |url: &str| {
        let Some(repo) = bridge::issues::repo_of(url) else { return false };
        projects.iter().any(|p| p.closed.iter().any(|i| i.url == url))
            || projects.iter().any(|p| p.repo.as_ref().is_some_and(|r| r.github.as_deref() == Some(repo.as_str())) && !p.issues.is_empty() && !p.issues.iter().any(|i| i.url == url))
    };
    if let Err(e) = bridge::config::prune_today(&dead) {
        eprintln!("today: {e}");
    }
    if let Err(e) = bridge::started::prune(&dead) {
        eprintln!("started: {e}");
    }
}

/// The terminal `config.json` names, read fresh at each click: the file is small and a click is
/// rare, so the bridge keeps no copy of it for the commands.
fn terminal_setting() -> String {
    bridge::config::Settings::new().config().terminal.clone()
}

/// Resume: a terminal in the Session's folder running `claude --resume <id>`.
#[tauri::command]
async fn resume(shared: tauri::State<'_, bridge::Shared>, path: String, id: String) -> Result<(), String> {
    let project = project(&shared, &path)?;
    let session = project.sessions.iter().find(|s| s.id == id).ok_or("not a Session of this Project")?;
    terminal::resume(&session.cwd, &terminal_setting(), &session.id)
}

/// New Session: a terminal in the Project's folder running `claude` with no prompt.
#[tauri::command]
async fn new_session(shared: tauri::State<'_, bridge::Shared>, path: String) -> Result<(), String> {
    let project = project(&shared, &path)?;
    terminal::new_session(&project.path, &terminal_setting())
}

/// Fix the checks: a terminal in the Project's folder running `claude` on one of its open pull
/// requests, from the bridge's own list, so the window cannot name one the repository has not.
#[tauri::command]
async fn fix_checks(shared: tauri::State<'_, bridge::Shared>, path: String, number: u32) -> Result<(), String> {
    let project = project(&shared, &path)?;
    let pull = project.pulls.iter().find(|p| p.number == number).ok_or_else(|| format!("not an open pull request of {path}: #{number}"))?;
    terminal::fix_checks(&project.path, &terminal_setting(), pull.number)
}

/// Start: a terminal in the Project's folder running `claude` with the Issue as its first prompt.
/// The Start is recorded once the terminal is open, so a launch that fails puts nothing in Doing;
/// the next tick rereads the Starts and sends the list again.
#[tauri::command]
async fn start(shared: tauri::State<'_, bridge::Shared>, path: String, number: u32) -> Result<(), String> {
    let (project, issue) = issue(&shared, &path, number)?;
    // The window never offers a blocked Issue; the bridge guards it anyway.
    if issue.blocked_by > 0 {
        return Err(format!("#{number} is blocked by an open Issue"));
    }
    // The Session gets an id of Undrift's choosing, the one thing that ties it to the Issue later.
    let session = uuid::Uuid::new_v4().to_string();
    terminal::start(&project.path, &terminal_setting(), number, &session)?;
    bridge::started::stamp(&issue.url, &chrono::Local::now().to_rfc3339(), &session).map_err(|e| e.to_string())?;
    prune(&shared);
    rebuild(&shared);
    Ok(())
}

/// Take out of Doing: forgets the Start of the Issue, so its Note goes back to Ready or Today. The
/// Session it opened runs on; only the Board's record of the Issue changes.
#[tauri::command]
async fn forget_start(shared: tauri::State<'_, bridge::Shared>, path: String, number: u32) -> Result<(), String> {
    let (_, issue) = issue(&shared, &path, number)?;
    bridge::started::forget(&issue.url).map_err(|e| e.to_string())?;
    rebuild(&shared);
    Ok(())
}

/// Today: pulls the Issue into Today now, or takes it out (GLOSSARY.md § Today). The config file's
/// mtime does the rebuild, as for Focus.
#[tauri::command]
async fn set_today(shared: tauri::State<'_, bridge::Shared>, path: String, number: u32, on: bool) -> Result<(), String> {
    let (_, issue) = issue(&shared, &path, number)?;
    if on && issue.blocked_by > 0 {
        return Err(format!("#{number} is blocked by an open Issue"));
    }
    let since = on.then(|| chrono::Local::now().to_rfc3339());
    bridge::config::set_today(&issue.url, since.as_deref()).map_err(|e| e.to_string())?;
    prune(&shared);
    Ok(())
}

/// Let Go: takes the Loose End off Home until the Project's next Activity. The next tick rereads
/// the Let Gos and sends the list again.
#[tauri::command]
async fn let_go(shared: tauri::State<'_, bridge::Shared>, path: String) -> Result<(), String> {
    let project = project(&shared, &path)?;
    bridge::let_go::stamp(&project.path, &chrono::Local::now().to_rfc3339()).map_err(|e| e.to_string())?;
    rebuild(&shared);
    Ok(())
}

/// The toast's Undo after a Let Go: the Loose End is back on Home on the next tick.
#[tauri::command]
async fn undo_let_go(shared: tauri::State<'_, bridge::Shared>, path: String) -> Result<(), String> {
    let project = project(&shared, &path)?;
    bridge::let_go::undo(&project.path).map_err(|e| e.to_string())?;
    rebuild(&shared);
    Ok(())
}

/// Focus: puts the Project in Focus now, or takes it out. Three at most – the bridge refuses the
/// fourth, and the window shows its words. The mtime does the rebuild, as for Let Go, but through the file.
#[tauri::command]
async fn set_focus(shared: tauri::State<'_, bridge::Shared>, path: String, on: bool) -> Result<(), String> {
    let project = project(&shared, &path)?;
    let since = on.then(|| chrono::Local::now().to_rfc3339());
    bridge::config::set_focus(std::path::Path::new(&project.path), since.as_deref()).map_err(|e| e.to_string())
}

fn rebuild(shared: &bridge::Shared) {
    if let Ok(mut l) = shared.lock() {
        l.rebuild = true;
    }
}

/// Ask the bridge to rescan transcripts, repos and Issues on its next tick; it answers with a
/// `projects` event even when nothing changed.
#[tauri::command]
async fn rescan(shared: tauri::State<'_, bridge::Shared>) -> Result<(), ()> {
    if let Ok(mut l) = shared.lock() {
        l.rescan = true;
    }
    Ok(())
}

/// The NavUser from the cache, so the header has it before `gh` answers, and whether `gh` already
/// answered; the `user` event follows when it has not (src/types.ts `NavUserNow`).
#[derive(serde::Serialize)]
struct NavUserNow {
    user: Option<bridge::user::NavUser>,
    answered: bool,
}

#[tauri::command]
async fn nav_user() -> NavUserNow {
    NavUserNow { user: bridge::user::cached(), answered: bridge::USER_ANSWERED.load(std::sync::atomic::Ordering::Relaxed) }
}

/// The cached avatar as raw bytes, empty when there is none yet: the window makes a Blob of it, so
/// no asset protocol is opened.
#[tauri::command]
async fn nav_user_avatar() -> tauri::ipc::Response {
    tauri::ipc::Response::new(bridge::user::avatar().unwrap_or_default())
}

/// Quit for real – closing the window only hides it in the tray.
#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .invoke_handler(tauri::generate_handler![projects_now, resume, new_session, fix_checks, start, forget_start, set_today, let_go, undo_let_go, set_focus, rescan, nav_user, nav_user_avatar, quit])
        .setup(|app| {
            bridge::start(app.handle().clone());
            tray(app)?;
            #[cfg(target_os = "linux")]
            claim_pinch(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window keeps the bridge alive in the tray; Quit is in the NavUser and the
            // tray menu.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// On Linux a touchpad pinch is WebKitGTK's own gesture: it zooms the whole webview, and no
/// setting turns it off (WebKit bug 273304). A GTK gesture on the window, in the capture phase,
/// claims the sequence before the webview sees it – the documented way for a parent to take a
/// gesture from a child – and does nothing with it. The Graph keeps its zoom through the wheel
/// events a pinch also sends.
#[cfg(target_os = "linux")]
fn claim_pinch(app: &tauri::App) -> tauri::Result<()> {
    use gtk::prelude::*;
    let Some(window) = app.get_webview_window("main") else { return Ok(()) };
    let zoom = gtk::GestureZoom::new(&window.gtk_window()?);
    zoom.set_propagation_phase(gtk::PropagationPhase::Capture);
    zoom.connect_begin(|gesture, _| {
        gesture.set_state(gtk::EventSequenceState::Claimed);
    });
    // The gesture must outlive this function: dropped, its last reference would disconnect it from
    // the window. It lives as long as the window does, which is as long as the app.
    std::mem::forget(zoom);
    Ok(())
}

fn tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show undrift", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    // The tray sits among the panel's own thin glyphs, so it gets a lighter cut of the symbol
    // (art/undrift-symbol-tray.svg) in white for Breeze Dark rather than the app icon.
    TrayIconBuilder::with_id("main")
        .icon(tauri::include_image!("icons/tray.png"))
        .tooltip("undrift")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn show_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}
