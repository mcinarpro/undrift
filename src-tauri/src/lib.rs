mod bridge;
mod terminal;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};

/// Latest list and what it holds, so the window has something to show before the first event;
/// `None` until the bridge built its first one.
#[tauri::command]
async fn projects_now(shared: tauri::State<'_, bridge::Shared>) -> Result<Option<bridge::Snapshot>, ()> {
    Ok(shared.lock().ok().and_then(|l| l.projects.clone().map(|projects| bridge::Snapshot { projects, read: l.read })))
}

/// The Project the window names, from the bridge's own list: the window never chooses the folder
/// a terminal opens in.
fn project(shared: &bridge::Shared, path: &str) -> Result<bridge::Project, String> {
    let latest = shared.lock().map_err(|_| "bridge state is poisoned")?;
    latest.projects.iter().flatten().find(|p| p.path == path).cloned().ok_or_else(|| format!("not a Project: {path}"))
}

/// Resume: a terminal in the Session's folder running `claude --resume <id>`.
#[tauri::command]
async fn resume(shared: tauri::State<'_, bridge::Shared>, path: String, id: String) -> Result<(), String> {
    let project = project(&shared, &path)?;
    let session = project.sessions.iter().find(|s| s.id == id).ok_or("not a Session of this Project")?;
    terminal::resume(&session.cwd, &session.id)
}

/// New Session: a terminal in the Project's folder running `claude` with no prompt.
#[tauri::command]
async fn new_session(shared: tauri::State<'_, bridge::Shared>, path: String) -> Result<(), String> {
    let project = project(&shared, &path)?;
    terminal::new_session(&project.path)
}

/// Start: a terminal in the Project's folder running `claude` with the Issue as its first prompt.
#[tauri::command]
async fn start(shared: tauri::State<'_, bridge::Shared>, path: String, number: u32) -> Result<(), String> {
    let project = project(&shared, &path)?;
    let Some(issue) = project.issues.iter().find(|i| i.number == number) else {
        return Err(format!("not an open Issue of {path}: #{number}"));
    };
    // The window never offers a blocked Issue; the bridge guards it anyway.
    if issue.blocked_by > 0 {
        return Err(format!("#{number} is blocked by an open Issue"));
    }
    terminal::start(&project.path, number)
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
        .invoke_handler(tauri::generate_handler![projects_now, resume, new_session, start, let_go, undo_let_go, rescan, nav_user, nav_user_avatar, quit])
        .setup(|app| {
            bridge::start(app.handle().clone());
            tray(app)?;
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
