mod bridge;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![projects_now, rescan])
        .setup(|app| {
            bridge::start(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
