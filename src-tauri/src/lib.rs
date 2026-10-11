mod recorder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(recorder::Recorder::default())
        .manage(recorder::Speaker::default())
        .invoke_handler(tauri::generate_handler![recorder::start_take, recorder::stop_take, recorder::start_voice, recorder::stop_voice])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
