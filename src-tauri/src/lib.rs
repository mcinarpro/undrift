mod bridge;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};

/// Latest list, so the window has something to show before the first event.
#[tauri::command]
async fn projects_now(shared: tauri::State<'_, bridge::Shared>) -> Result<Vec<bridge::Project>, ()> {
    Ok(shared.lock().map(|l| l.projects.clone()).unwrap_or_default())
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

/// The NavUser from the cache, so the header has it before `gh` answers; the `user` event follows.
#[tauri::command]
async fn nav_user() -> Option<bridge::user::NavUser> {
    bridge::user::cached()
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
        .invoke_handler(tauri::generate_handler![projects_now, rescan, nav_user, nav_user_avatar, quit])
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
