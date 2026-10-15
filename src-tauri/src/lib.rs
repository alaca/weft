mod midi;
mod recorder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // The window on Linux counts the channels of the sound output from the devices GStreamer
    // finds, and says 0 when none gives a plain number. Strudel cannot set up its mix with 0
    // channels and drops every note, so the window is told the output is stereo.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_GST_MAX_NUMBER_OF_AUDIO_OUTPUT_CHANNELS").is_none() {
        std::env::set_var("WEBKIT_GST_MAX_NUMBER_OF_AUDIO_OUTPUT_CHANNELS", "2");
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(recorder::Recorder::default())
        .manage(recorder::Speaker::default())
        .manage(midi::Keyboards::default())
        .manage(midi::Outputs::default())
        .invoke_handler(tauri::generate_handler![recorder::start_take, recorder::stop_take, recorder::start_voice, recorder::stop_voice, recorder::sound_inputs, midi::midi_inputs, midi::midi_listen, midi::midi_stop, midi::midi_outputs, midi::midi_note, midi::midi_silence, midi::midi_clock, midi::midi_follow, midi::midi_own_port])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
