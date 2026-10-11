mod recorder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(recorder::Recorder::default())
        .invoke_handler(tauri::generate_handler![recorder::start_take, recorder::stop_take])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
