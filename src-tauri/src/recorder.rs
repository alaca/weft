// Recording from the microphone on the machine's own audio system, for the desktop app. The
// window's way of reaching a microphone depends on what the system lets a web view do; this way
// does not. A take is held in memory while it is made and handed over as a WAV file.
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SizedSample};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

const LONGEST_SECONDS: usize = 600;
const ANSWER: Duration = Duration::from_secs(6);

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

fn open() -> Result<(cpal::Stream, Heard, u32, u16), String> {
    let device = cpal::default_host().default_input_device().ok_or("missing")?;
    let supported = device.default_input_config().map_err(|err| err.to_string())?;
    let format = supported.sample_format();
    let config: cpal::StreamConfig = supported.into();
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

#[tauri::command]
pub fn start_take(recorder: tauri::State<Recorder>) -> Result<(), String> {
    let mut slot = recorder.0.lock().map_err(|_| "the recorder is busy")?;
    if slot.is_some() {
        return Err("a take is already being made".into());
    }
    let (stop, stopped) = channel::<()>();
    let (ready, is_ready) = channel::<Result<(), String>>();
    let (give, taken) = channel::<Result<Vec<u8>, String>>();
    // The stream cannot be moved between threads, so it lives and ends on this one.
    std::thread::spawn(move || match open() {
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

#[tauri::command]
pub fn stop_take(recorder: tauri::State<Recorder>) -> Result<tauri::ipc::Response, String> {
    let running = recorder.0.lock().map_err(|_| "the recorder is busy")?.take().ok_or("no take is being made")?;
    let _ = running.stop.send(());
    let bytes = running.taken.recv_timeout(ANSWER).map_err(|_| "the microphone did not answer".to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::wav;
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
