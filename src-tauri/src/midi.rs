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

// Whose clock the song follows: nobody's, any that comes in, or that of one keyboard by name.
#[derive(Clone, PartialEq, Debug)]
pub enum Following {
    Nobody,
    Any,
    Named(String),
}

static FOLLOWED: Mutex<Following> = Mutex::new(Following::Nobody);

// The words of a clock: where the song is, a tick, start, go on, stop.
fn is_clock(status: u8) -> bool {
    matches!(status, 0xf2 | 0xf8 | 0xfa | 0xfb | 0xfc)
}

// What of a message from the keyboard of that name goes on to the window. A word of a clock goes
// only from the keyboard that is followed, with the moment it came in, in millionths of a
// second, put after it: the window could only tell the moment it got it, which is far less
// even. Time code and the long messages are of no use here.
fn passed(bytes: &[u8], stamp: u64, from: &str, followed: &Following) -> Option<Vec<u8>> {
    let status = *bytes.first()?;
    if status == 0xf1 || status == 0xf0 {
        return None;
    }
    if !is_clock(status) {
        return Some(bytes.to_vec());
    }
    let follows = match followed {
        Following::Nobody => false,
        Following::Any => true,
        Following::Named(name) => name == from,
    };
    if !follows {
        return None;
    }
    let mut said = bytes.to_vec();
    said.extend_from_slice(&stamp.to_le_bytes());
    Some(said)
}

fn listen(name: &str, to: Channel<InvokeResponseBody>) -> Option<MidiInputConnection<()>> {
    let mut input = MidiInput::new(NAME).ok()?;
    // A clock is heard, for a song that follows one; the "still here" of a keyboard is not.
    input.ignore(Ignore::SysexAndActiveSense);
    let ports = input.ports();
    let port = ports.iter().find(|port| input.port_name(port).ok().as_deref() == Some(name))?;
    let from = name.to_string();
    input
        .connect(
            port,
            "weft-loom-in",
            move |stamp, bytes, _| {
                let followed = FOLLOWED.lock().map(|followed| followed.clone()).unwrap_or(Following::Nobody);
                if let Some(said) = passed(bytes, stamp, &from, &followed) {
                    let _ = to.send(InvokeResponseBody::Raw(said));
                }
            },
            (),
        )
        .ok()
}

// Whose clock the song follows from now on: any keyboard's, the one of that name, or nobody's.
#[tauri::command]
pub fn midi_follow(port: Option<String>, any: bool) -> Result<(), String> {
    let mut followed = FOLLOWED.lock().map_err(|_| "the clock is busy")?;
    *followed = match (any, port) {
        (true, _) => Following::Any,
        (false, Some(name)) => Following::Named(name),
        (false, None) => Following::Nobody,
    };
    Ok(())
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

// ---- notes going out, to a synth or to another program. A note is handed over a little before
// it is due, with how long to wait, and one thread sends each at its moment: the window keeps
// time too loosely for that. It also remembers which notes sound, so that they can all be
// stopped at once.
use midir::{MidiOutput, MidiOutputConnection};
use std::collections::HashSet;
use std::time::Instant;

enum Out {
    Send { port: Option<String>, at: Instant, bytes: [u8; 3] },
    Silence,
    // The tempo, for what follows a MIDI clock: twenty-four ticks to a quarter note from `at`
    // on, after a word to start. No tempo is the word to stop.
    Clock { port: Option<String>, bpm: Option<f64>, at: Instant },
}

struct Ticking {
    name: String,
    next: Instant,
    every: Duration,
}

const START: u8 = 0xfa;
const STOP: u8 = 0xfc;
const TICK: u8 = 0xf8;

pub struct Sending {
    tell: Sender<Out>,
}

#[derive(Default)]
pub struct Outputs(pub Mutex<Option<Sending>>);

fn output_names() -> Vec<String> {
    match MidiOutput::new(NAME) {
        Ok(output) => output.ports().iter().filter_map(|port| output.port_name(port).ok()).filter(|name| is_keyboard(name)).collect(),
        Err(_) => Vec::new(),
    }
}

// The output of that name, or the first there is when none is named.
fn reach(wanted: Option<&str>) -> Option<(String, MidiOutputConnection)> {
    let output = MidiOutput::new(NAME).ok()?;
    let ports = output.ports();
    let port = ports.iter().find(|port| {
        let name = output.port_name(port).unwrap_or_default();
        is_keyboard(&name) && wanted.map_or(true, |asked| asked == name)
    })?;
    let name = output.port_name(port).ok()?;
    output.connect(port, "weft-loom-out").ok().map(|connection| (name, connection))
}

// The output that is asked for, open: by its name, or the first there is, which is found once.
fn opened(port: Option<String>, open: &mut HashMap<String, MidiOutputConnection>, usual: &mut Option<String>) -> Option<String> {
    let name = match port.or_else(|| usual.clone()) {
        Some(name) => name,
        None => {
            let (name, connection) = reach(None)?;
            open.insert(name.clone(), connection);
            *usual = Some(name.clone());
            name
        }
    };
    if !open.contains_key(&name) {
        let (_, connection) = reach(Some(&name))?;
        open.insert(name.clone(), connection);
    }
    Some(name)
}

fn send_loop(told: std::sync::mpsc::Receiver<Out>) {
    let mut open: HashMap<String, MidiOutputConnection> = HashMap::new();
    let mut usual: Option<String> = None;
    let mut due: Vec<(Instant, String, [u8; 3])> = Vec::new();
    let mut sounding: HashSet<(String, u8, u8)> = HashSet::new();
    let mut clock: Option<Ticking> = None;
    loop {
        let now = Instant::now();
        let next = due.iter().map(|(at, _, _)| *at).chain(clock.iter().map(|ticking| ticking.next)).min();
        let wait = next.map_or(Duration::from_secs(3600), |at| at.saturating_duration_since(now));
        match told.recv_timeout(wait) {
            Ok(Out::Send { port, at, bytes }) => {
                let Some(name) = opened(port, &mut open, &mut usual) else { continue };
                due.push((at, name, bytes));
            }
            Ok(Out::Clock { port, bpm: Some(bpm), at }) => {
                let every = Duration::from_secs_f64(60.0 / (bpm.clamp(20.0, 400.0) * 24.0));
                match clock.as_mut() {
                    // A clock that runs keeps its beat and takes the new tempo from its next tick on.
                    Some(ticking) => ticking.every = every,
                    None => {
                        let Some(name) = opened(port, &mut open, &mut usual) else { continue };
                        due.push((at, name.clone(), [START, 0, 0]));
                        clock = Some(Ticking { name, next: at, every });
                    }
                }
            }
            Ok(Out::Clock { bpm: None, .. }) => {
                if let Some(ticking) = clock.take() {
                    if let Some(connection) = open.get_mut(&ticking.name) {
                        let _ = connection.send(&[STOP]);
                    }
                }
            }
            Ok(Out::Silence) => {
                due.clear();
                for (name, channel, note) in sounding.drain() {
                    if let Some(connection) = open.get_mut(&name) {
                        let _ = connection.send(&[0x80 | channel, note, 0]);
                    }
                }
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }
        let now = Instant::now();
        let mut left = Vec::with_capacity(due.len());
        // What is due is sent in the order it is due, and a note that ends before one begins.
        due.sort_by_key(|(at, _, bytes)| (*at, bytes[0] & 0xf0));
        for (at, name, bytes) in due.drain(..) {
            if at > now {
                left.push((at, name, bytes));
                continue;
            }
            // A word to start, to stop or to tick is one byte long.
            let said: &[u8] = if bytes[0] >= TICK { &bytes[..1] } else { &bytes };
            let gone = match open.get_mut(&name) {
                Some(connection) => connection.send(said).is_err(),
                None => true,
            };
            // An output that was unplugged is let go of, and looked for again when it is asked for.
            if gone {
                open.remove(&name);
                continue;
            }
            let key = (name, bytes[0] & 0x0f, bytes[1]);
            match bytes[0] & 0xf0 {
                0x90 if bytes[2] > 0 => {
                    sounding.insert(key);
                }
                0x80 | 0x90 => {
                    sounding.remove(&key);
                }
                _ => {}
            }
        }
        due = left;
        if let Some(ticking) = clock.as_mut() {
            // A machine that was held up catches up, but not with more ticks than a beat has.
            let mut sent = 0;
            while ticking.next <= Instant::now() && sent < 24 {
                if let Some(connection) = open.get_mut(&ticking.name) {
                    let _ = connection.send(&[TICK]);
                }
                ticking.next += ticking.every;
                sent += 1;
            }
            if sent == 24 {
                ticking.next = Instant::now() + ticking.every;
            }
        }
    }
}

fn tell(outputs: &tauri::State<Outputs>, said: Out) -> Result<(), String> {
    let mut slot = outputs.0.lock().map_err(|_| "the outputs are busy")?;
    if slot.is_none() {
        let (tell, told) = channel::<Out>();
        std::thread::spawn(move || send_loop(told));
        *slot = Some(Sending { tell });
    }
    slot.as_ref().map(|sending| sending.tell.send(said)).transpose().map_err(|_| "the outputs have stopped".to_string())?;
    Ok(())
}

// What there is to send notes to, by name.
#[tauri::command(async)]
pub fn midi_outputs() -> Vec<String> {
    output_names()
}

// One note: when it begins, counted in thousandths of a second from now, and how long it lasts.
// The channel counts from 1, as on every synth.
#[tauri::command]
pub fn midi_note(outputs: tauri::State<Outputs>, port: Option<String>, channel: u8, note: u8, force: u8, wait: f64, length: f64) -> Result<(), String> {
    let channel = channel.clamp(1, 16) - 1;
    let note = note.min(127);
    let begins = Instant::now() + Duration::from_secs_f64(wait.clamp(0.0, 10_000.0) / 1000.0);
    let ends = begins + Duration::from_secs_f64(length.clamp(1.0, 600_000.0) / 1000.0);
    tell(&outputs, Out::Send { port: port.clone(), at: begins, bytes: [0x90 | channel, note, force.clamp(1, 127)] })?;
    tell(&outputs, Out::Send { port, at: ends, bytes: [0x80 | channel, note, 0] })
}

// The tempo of the song, in quarter notes a minute, sent as a MIDI clock from `wait` thousandths
// of a second from now on. With no tempo the clock stops.
#[tauri::command]
pub fn midi_clock(outputs: tauri::State<Outputs>, port: Option<String>, bpm: Option<f64>, wait: f64) -> Result<(), String> {
    if bpm.is_none() && outputs.0.lock().map_err(|_| "the outputs are busy")?.is_none() {
        return Ok(());
    }
    tell(&outputs, Out::Clock { port, bpm, at: Instant::now() + Duration::from_secs_f64(wait.clamp(0.0, 10_000.0) / 1000.0) })
}

// Every note that sounds is stopped, and none that waits is sent.
#[tauri::command]
pub fn midi_silence(outputs: tauri::State<Outputs>) -> Result<(), String> {
    if outputs.0.lock().map_err(|_| "the outputs are busy")?.is_none() {
        return Ok(());
    }
    tell(&outputs, Out::Silence)
}

#[cfg(test)]
mod tests {
    use super::{is_keyboard, names, output_names};

    // Passes on a machine with no keyboard too; what it prints says what was found.
    #[test]
    fn asks_which_keyboards_are_plugged_in() {
        println!("keyboards: {:?}", names());
        println!("outputs: {:?}", output_names());
    }

    // A port made for the test stands in for a synth: what is sent to it by name arrives, a note
    // begun and ended at the moments asked for, and a note that still sounds is ended when all
    // are silenced.
    #[cfg(target_os = "macos")]
    #[test]
    fn sends_each_note_at_its_moment_and_ends_those_that_sound() {
        use super::{send_loop, Out};
        use midir::os::unix::VirtualInput;
        use midir::MidiInput;
        use std::sync::mpsc::channel;
        use std::time::{Duration, Instant};

        let (got, gotten) = channel::<(Instant, Vec<u8>)>();
        let mut listener = MidiInput::new("Weft Loom test").unwrap();
        listener.ignore(midir::Ignore::None);
        let synth = listener.create_virtual("Weft Loom test synth", move |_, bytes, _| {
            let _ = got.send((Instant::now(), bytes.to_vec()));
        }, ());
        let Ok(_synth) = synth else {
            println!("no port could be made on this machine, so nothing was sent");
            return;
        };
        std::thread::sleep(Duration::from_millis(300));
        let (tell, told) = channel::<Out>();
        std::thread::spawn(move || send_loop(told));
        let port = Some("Weft Loom test synth".to_string());
        let start = Instant::now();
        tell.send(Out::Send { port: port.clone(), at: start + Duration::from_millis(150), bytes: [0x80, 60, 0] }).unwrap();
        tell.send(Out::Send { port: port.clone(), at: start + Duration::from_millis(50), bytes: [0x90, 60, 100] }).unwrap();
        tell.send(Out::Send { port: port.clone(), at: start + Duration::from_millis(200), bytes: [0x91, 64, 90] }).unwrap();
        std::thread::sleep(Duration::from_millis(320));
        tell.send(Out::Silence).unwrap();
        std::thread::sleep(Duration::from_millis(150));
        let heard: Vec<(Instant, Vec<u8>)> = gotten.try_iter().collect();
        let bytes: Vec<Vec<u8>> = heard.iter().map(|(_, bytes)| bytes.clone()).collect();
        assert_eq!(bytes, vec![vec![0x90, 60, 100], vec![0x80, 60, 0], vec![0x91, 64, 90], vec![0x81, 64, 0]]);
        let held = heard[1].0.duration_since(heard[0].0).as_millis() as i64;
        let began = heard[0].0.duration_since(start).as_millis() as i64;
        println!("the note began {began} ms after it was asked for and was held {held} ms");
        assert!((began - 50).abs() < 25, "began after {began} ms");
        assert!((held - 100).abs() < 25, "held for {held} ms");

        // The tempo as a clock: a word to start, twenty-four ticks to the beat, a word to stop.
        tell.send(Out::Clock { port: port.clone(), bpm: Some(120.0), at: Instant::now() }).unwrap();
        std::thread::sleep(Duration::from_millis(510));
        tell.send(Out::Clock { port, bpm: None, at: Instant::now() }).unwrap();
        std::thread::sleep(Duration::from_millis(100));
        let clock: Vec<u8> = gotten.try_iter().map(|(_, bytes)| bytes[0]).collect();
        let ticks = clock.iter().filter(|byte| **byte == 0xf8).count();
        println!("in half a second at 120 the clock ticked {ticks} times");
        assert_eq!(clock.first(), Some(&0xfa));
        assert_eq!(clock.last(), Some(&0xfc));
        assert!((23..=26).contains(&ticks), "{ticks} ticks");
    }

    // A keyboard's notes always go on; its clock only when it is followed, with the moment after it.
    #[test]
    fn passes_on_a_clock_only_from_the_keyboard_that_is_followed() {
        use super::{passed, Following};
        let named = Following::Named("Drum machine".into());
        assert_eq!(passed(&[0x90, 60, 100], 5, "Keys", &Following::Nobody), Some(vec![0x90, 60, 100]));
        assert_eq!(passed(&[0xf8], 5, "Drum machine", &Following::Nobody), None);
        assert_eq!(passed(&[0xf8], 5, "Keys", &named), None);
        assert_eq!(passed(&[0xfa], 0x0102, "Drum machine", &named), Some(vec![0xfa, 2, 1, 0, 0, 0, 0, 0, 0]));
        assert_eq!(passed(&[0xf2, 8, 1], 7, "Keys", &Following::Any), Some(vec![0xf2, 8, 1, 7, 0, 0, 0, 0, 0, 0, 0]));
        assert_eq!(passed(&[0xf1, 3], 7, "Keys", &Following::Any), None);
    }

    #[test]
    fn leaves_out_the_port_nothing_is_plugged_into() {
        assert!(!is_keyboard("Midi Through Port-0"));
        assert!(is_keyboard("Keystation 49 MK3"));
    }
}
