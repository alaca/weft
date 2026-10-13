// Recording from the microphone on the machine's own audio system, for the desktop app. The
// window's way of reaching a microphone depends on what the system lets a web view do; this way
// does not. A take is held in memory while it is made and handed over as a WAV file.
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SizedSample};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::ipc::{Channel, InvokeResponseBody};

const LONGEST_SECONDS: usize = 600;
const ANSWER: Duration = Duration::from_secs(6);
// How much of a voice is handed to the window at a time, in samples: about a fortieth of a second.
const VOICE_PIECE: usize = 1024;
const VOICE_WAIT: Duration = Duration::from_millis(50);

pub struct Running {
    stop: Sender<()>,
    taken: Receiver<Result<Vec<u8>, String>>,
}

#[derive(Default)]
pub struct Recorder(pub Mutex<Option<Running>>);

type Heard = Arc<Mutex<Vec<f32>>>;

fn listen<T>(device: &cpal::Device, config: &cpal::StreamConfig, heard: Heard, most: usize) -> Result<cpal::Stream, String>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    device
        .build_input_stream(
            config.clone(),
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                if let Ok(mut samples) = heard.lock() {
                    let room = most.saturating_sub(samples.len());
                    samples.extend(data.iter().take(room).map(|sample| f32::from_sample(*sample)));
                }
            },
            |_| {},
            None,
        )
        .map_err(|err| err.to_string())
}

fn name_of(device: &cpal::Device) -> Option<String> {
    device.description().ok().map(|described| described.name().to_string())
}

// The microphone that was chosen, by its name. When none was chosen, or the chosen one is not
// plugged in, it is the one the system records from.
fn input(wanted: Option<&str>) -> Result<(cpal::Device, cpal::SampleFormat, cpal::StreamConfig), String> {
    let host = cpal::default_host();
    let chosen = wanted.and_then(|name| host.input_devices().ok()?.find(|device| name_of(device).as_deref() == Some(name)));
    let device = match chosen {
        Some(device) => device,
        None => host.default_input_device().ok_or("missing")?,
    };
    let supported = device.default_input_config().map_err(|err| err.to_string())?;
    let format = supported.sample_format();
    Ok((device, format, supported.into()))
}

fn open(wanted: Option<&str>) -> Result<(cpal::Stream, Heard, u32, u16), String> {
    let (device, format, config) = input(wanted)?;
    let rate = config.sample_rate;
    let channels = config.channels;
    let most = rate as usize * channels as usize * LONGEST_SECONDS;
    let heard: Heard = Arc::new(Mutex::new(Vec::new()));
    let stream = match format {
        cpal::SampleFormat::F32 => listen::<f32>(&device, &config, heard.clone(), most),
        cpal::SampleFormat::I16 => listen::<i16>(&device, &config, heard.clone(), most),
        cpal::SampleFormat::U16 => listen::<u16>(&device, &config, heard.clone(), most),
        cpal::SampleFormat::I32 => listen::<i32>(&device, &config, heard.clone(), most),
        other => Err(format!("the microphone gives sound as {other}, which is not read")),
    }?;
    stream.play().map_err(|err| err.to_string())?;
    Ok((stream, heard, rate, channels))
}

// For a call the microphone is not kept but passed on as it comes, with its channels made one.
fn overhear<T>(device: &cpal::Device, config: &cpal::StreamConfig, pass: Sender<Vec<f32>>) -> Result<cpal::Stream, String>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let channels = config.channels.max(1) as usize;
    device
        .build_input_stream(
            config.clone(),
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                let one: Vec<f32> = data.chunks(channels).map(|frame| frame.iter().map(|sample| f32::from_sample(*sample)).sum::<f32>() / channels as f32).collect();
                let _ = pass.send(one);
            },
            |_| {},
            None,
        )
        .map_err(|err| err.to_string())
}

fn open_voice(wanted: Option<&str>, pass: Sender<Vec<f32>>) -> Result<(cpal::Stream, u32), String> {
    let (device, format, config) = input(wanted)?;
    let stream = match format {
        cpal::SampleFormat::F32 => overhear::<f32>(&device, &config, pass),
        cpal::SampleFormat::I16 => overhear::<i16>(&device, &config, pass),
        cpal::SampleFormat::U16 => overhear::<u16>(&device, &config, pass),
        cpal::SampleFormat::I32 => overhear::<i32>(&device, &config, pass),
        other => Err(format!("the microphone gives sound as {other}, which is not read")),
    }?;
    stream.play().map_err(|err| err.to_string())?;
    Ok((stream, config.sample_rate))
}

// The samples of a voice as the bytes the window reads them from, four to a sample.
fn voice_bytes(samples: &[f32]) -> Vec<u8> {
    samples.iter().flat_map(|sample| sample.to_le_bytes()).collect()
}

pub struct Speaking {
    stop: Sender<()>,
}

#[derive(Default)]
pub struct Speaker(pub Mutex<Option<Speaking>>);

// Starts handing the microphone to the window, and says how many samples a second it gives.
// A microphone can take seconds to answer, and a wait on the main thread holds the whole window
// still, so the commands that wait for one are run off it.
#[tauri::command(async)]
pub fn start_voice(speaker: tauri::State<Speaker>, device: Option<String>, on_sound: Channel<InvokeResponseBody>) -> Result<u32, String> {
    let mut slot = speaker.0.lock().map_err(|_| "the microphone is busy")?;
    if let Some(before) = slot.take() {
        let _ = before.stop.send(());
    }
    let (stop, stopped) = channel::<()>();
    let (ready, is_ready) = channel::<Result<u32, String>>();
    std::thread::spawn(move || {
        let (pass, passed) = channel::<Vec<f32>>();
        match open_voice(device.as_deref(), pass) {
            Ok((stream, rate)) => {
                let _ = ready.send(Ok(rate));
                let mut held: Vec<f32> = Vec::with_capacity(VOICE_PIECE * 2);
                loop {
                    match stopped.try_recv() {
                        Ok(_) | Err(TryRecvError::Disconnected) => break,
                        Err(TryRecvError::Empty) => {}
                    }
                    match passed.recv_timeout(VOICE_WAIT) {
                        Ok(piece) => {
                            held.extend(piece);
                            if held.len() < VOICE_PIECE {
                                continue;
                            }
                            // The window is gone when it no longer takes what it is handed.
                            if on_sound.send(InvokeResponseBody::Raw(voice_bytes(&held))).is_err() {
                                break;
                            }
                            held.clear();
                        }
                        Err(RecvTimeoutError::Timeout) => {}
                        Err(RecvTimeoutError::Disconnected) => break,
                    }
                }
                drop(stream);
            }
            Err(why) => {
                let _ = ready.send(Err(why));
            }
        }
    });
    let rate = is_ready.recv_timeout(ANSWER).map_err(|_| "the microphone did not answer".to_string())??;
    *slot = Some(Speaking { stop });
    Ok(rate)
}

#[tauri::command]
pub fn stop_voice(speaker: tauri::State<Speaker>) -> Result<(), String> {
    if let Some(speaking) = speaker.0.lock().map_err(|_| "the microphone is busy")?.take() {
        let _ = speaking.stop.send(());
    }
    Ok(())
}

// Sixteen bits a sample, the channels side by side.
fn wav(samples: &[f32], rate: u32, channels: u16) -> Vec<u8> {
    let size = (samples.len() * 2) as u32;
    let mut bytes = Vec::with_capacity(44 + samples.len() * 2);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + size).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&channels.to_le_bytes());
    bytes.extend_from_slice(&rate.to_le_bytes());
    bytes.extend_from_slice(&(rate * channels as u32 * 2).to_le_bytes());
    bytes.extend_from_slice(&(channels * 2).to_le_bytes());
    bytes.extend_from_slice(&16u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&size.to_le_bytes());
    for sample in samples {
        bytes.extend_from_slice(&((sample.clamp(-1.0, 1.0) * 32767.0).round() as i16).to_le_bytes());
    }
    bytes
}

// The microphones the machine has, by name, and the one the system records from. Asking does
// not open any of them.
#[tauri::command(async)]
pub fn sound_inputs() -> (Vec<String>, Option<String>) {
    let host = cpal::default_host();
    let mut names: Vec<String> = host.input_devices().map(|devices| devices.filter_map(|device| name_of(&device)).collect()).unwrap_or_default();
    names.dedup();
    (names, host.default_input_device().as_ref().and_then(name_of))
}

// Waits for the microphone, so it is run off the main thread, as the start of a voice is.
#[tauri::command(async)]
pub fn start_take(recorder: tauri::State<Recorder>, device: Option<String>) -> Result<(), String> {
    let mut slot = recorder.0.lock().map_err(|_| "the recorder is busy")?;
    if slot.is_some() {
        return Err("a take is already being made".into());
    }
    let (stop, stopped) = channel::<()>();
    let (ready, is_ready) = channel::<Result<(), String>>();
    let (give, taken) = channel::<Result<Vec<u8>, String>>();
    // The stream cannot be moved between threads, so it lives and ends on this one.
    std::thread::spawn(move || match open(device.as_deref()) {
        Ok((stream, heard, rate, channels)) => {
            let _ = ready.send(Ok(()));
            let _ = stopped.recv();
            drop(stream);
            let samples = heard.lock().map(|held| held.clone()).unwrap_or_default();
            // A microphone the system has not allowed gives nothing but silence, and no error.
            let silent = samples.iter().all(|sample| sample.abs() < 1e-6);
            let _ = give.send(if samples.is_empty() || silent { Err("silent".into()) } else { Ok(wav(&samples, rate, channels)) });
        }
        Err(why) => {
            let _ = ready.send(Err(why));
        }
    });
    is_ready.recv_timeout(ANSWER).map_err(|_| "the microphone did not answer".to_string())??;
    *slot = Some(Running { stop, taken });
    Ok(())
}

// Waits for the take to be handed over, so it is run off the main thread too.
#[tauri::command(async)]
pub fn stop_take(recorder: tauri::State<Recorder>) -> Result<tauri::ipc::Response, String> {
    let running = recorder.0.lock().map_err(|_| "the recorder is busy")?.take().ok_or("no take is being made")?;
    let _ = running.stop.send(());
    let bytes = running.taken.recv_timeout(ANSWER).map_err(|_| "the microphone did not answer".to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::{sound_inputs, voice_bytes, wav};
    use cpal::traits::{DeviceTrait, HostTrait};

    // Asks the machine what it would record from, without recording. It passes on a machine
    // with no microphone too; what it prints says what was found.
    #[test]
    fn finds_what_the_machine_records_from() {
        match cpal::default_host().default_input_device() {
            Some(device) => match device.default_input_config() {
                Ok(config) => println!("input: {} Hz, {} channels, {}", config.sample_rate(), config.channels(), config.sample_format()),
                Err(why) => println!("input: no usable setting ({why})"),
            },
            None => println!("input: none"),
        }
    }

    // Passes on a machine with no microphone too. The one the system records from is among
    // the ones that are listed.
    #[test]
    fn lists_the_microphones_without_opening_one() {
        let (names, usual) = sound_inputs();
        println!("inputs: {names:?}, usual: {usual:?}");
        if let Some(usual) = usual {
            assert!(names.contains(&usual));
        }
    }

    #[test]
    fn hands_a_voice_over_four_bytes_to_a_sample() {
        let bytes = voice_bytes(&[0.0, 1.0, -0.5]);
        assert_eq!(bytes.len(), 12);
        assert_eq!(f32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]), 1.0);
        assert_eq!(f32::from_le_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]), -0.5);
    }

    #[test]
    fn writes_a_sixteen_bit_file() {
        let bytes = wav(&[0.0, 0.5, -1.0, 2.0], 48000, 2);
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[8..16], b"WAVEfmt ");
        assert_eq!(u16::from_le_bytes([bytes[22], bytes[23]]), 2);
        assert_eq!(u32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]), 48000);
        assert_eq!(u32::from_le_bytes([bytes[40], bytes[41], bytes[42], bytes[43]]), 8);
        assert_eq!(bytes.len(), 44 + 8);
        assert_eq!(i16::from_le_bytes([bytes[46], bytes[47]]), 16384);
        assert_eq!(i16::from_le_bytes([bytes[48], bytes[49]]), -32767);
        assert_eq!(i16::from_le_bytes([bytes[50], bytes[51]]), 32767);
    }
}
