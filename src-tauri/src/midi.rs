// MIDI keyboards, heard by the app itself: the window of a Mac has no way to reach one. Every
// keyboard that is plugged in is listened to, and what one plays is handed to the window as it
// comes. The machine is asked again every little while what is plugged in, so that a keyboard
// that comes later is heard too, and one that goes is let go of.
use midir::{Ignore, MidiInput, MidiInputConnection};
use std::collections::HashMap;
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::time::Duration;
use tauri::ipc::{Channel, InvokeResponseBody};

const NAME: &str = "Weft Loom";
const LOOK_EVERY: Duration = Duration::from_millis(1500);

pub struct Hearing {
    stop: Sender<()>,
}

#[derive(Default)]
pub struct Keyboards(pub Mutex<Option<Hearing>>);

// A port that every Linux machine has and nothing is plugged into.
fn is_keyboard(name: &str) -> bool {
    !name.starts_with("Midi Through")
}

fn names() -> Vec<String> {
    match MidiInput::new(NAME) {
        Ok(input) => input.ports().iter().filter_map(|port| input.port_name(port).ok()).filter(|name| is_keyboard(name)).collect(),
        Err(_) => Vec::new(),
    }
}

fn listen(name: &str, to: Channel<InvokeResponseBody>) -> Option<MidiInputConnection<()>> {
    let mut input = MidiInput::new(NAME).ok()?;
    // The clock, the "still here" and the long messages of a keyboard are of no use here, and
    // a clock sends many a second.
    input.ignore(Ignore::All);
    let ports = input.ports();
    let port = ports.iter().find(|port| input.port_name(port).ok().as_deref() == Some(name))?;
    input
        .connect(
            port,
            "weft-loom-in",
            move |_, bytes, _| {
                let _ = to.send(InvokeResponseBody::Raw(bytes.to_vec()));
            },
            (),
        )
        .ok()
}

// The keyboards that are plugged in now, by name.
#[tauri::command(async)]
pub fn midi_inputs() -> Vec<String> {
    names()
}

// Starts handing the window what the keyboards play: each message as its bytes. Whenever the
// keyboards that are there change, the window is handed their names, as a list.
#[tauri::command(async)]
pub fn midi_listen(keyboards: tauri::State<Keyboards>, on_message: Channel<InvokeResponseBody>) -> Result<(), String> {
    let mut slot = keyboards.0.lock().map_err(|_| "the keyboards are busy")?;
    if let Some(before) = slot.take() {
        let _ = before.stop.send(());
    }
    let (stop, stopped) = channel::<()>();
    std::thread::spawn(move || {
        // A connection cannot be moved between threads on every system, so they live and end here.
        let mut open: HashMap<String, MidiInputConnection<()>> = HashMap::new();
        let mut told: Option<Vec<String>> = None;
        loop {
            let there = names();
            open.retain(|name, _| there.contains(name));
            for name in &there {
                if !open.contains_key(name) {
                    if let Some(connection) = listen(name, on_message.clone()) {
                        open.insert(name.clone(), connection);
                    }
                }
            }
            if told.as_ref() != Some(&there) {
                let said = serde_json::to_string(&there).unwrap_or_else(|_| "[]".into());
                // The window is gone when it no longer takes what it is handed.
                if on_message.send(InvokeResponseBody::Json(said)).is_err() {
                    break;
                }
                told = Some(there);
            }
            match stopped.recv_timeout(LOOK_EVERY) {
                Err(RecvTimeoutError::Timeout) => {}
                _ => break,
            }
        }
    });
    *slot = Some(Hearing { stop });
    Ok(())
}

#[tauri::command]
pub fn midi_stop(keyboards: tauri::State<Keyboards>) -> Result<(), String> {
    if let Some(hearing) = keyboards.0.lock().map_err(|_| "the keyboards are busy")?.take() {
        let _ = hearing.stop.send(());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{is_keyboard, names};

    // Passes on a machine with no keyboard too; what it prints says what was found.
    #[test]
    fn asks_which_keyboards_are_plugged_in() {
        println!("keyboards: {:?}", names());
    }

    #[test]
    fn leaves_out_the_port_nothing_is_plugged_into() {
        assert!(!is_keyboard("Midi Through Port-0"));
        assert!(is_keyboard("Keystation 49 MK3"));
    }
}
