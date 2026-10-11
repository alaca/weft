import { TakeRefused, whyNot } from '../library/recorder'

// Your voice for a call, as a stream the call can send. In a browser the window's own way of
// reaching a microphone is used, with the machine's tidying up of a voice switched on. In the
// desktop app the app itself listens, as it does for a take, and hands what it hears to the
// window a little at a time; here that is laid end to end into a stream.
export type Captured = { stream: MediaStream; stop(): void }

const LEAD = 0.06
const inDesktop = () => '__TAURI_INTERNALS__' in window

function fromApp(err: unknown): TakeRefused {
    const said = String((err as Error)?.message ?? err)
    return new TakeRefused(said === 'missing' ? 'missing' : 'other', said)
}

async function appVoice(): Promise<Captured> {
    const { invoke, Channel } = await import('@tauri-apps/api/core')
    const context = new AudioContext()
    const out = context.createMediaStreamDestination()
    let rate: number | null = null
    let next = 0
    const early: ArrayBuffer[] = []
    const play = (bytes: ArrayBuffer) => {
        const samples = new Float32Array(bytes)
        if (!samples.length || rate === null) return
        const buffer = context.createBuffer(1, samples.length, rate)
        buffer.copyToChannel(samples, 0)
        const source = context.createBufferSource()
        source.buffer = buffer
        source.connect(out)
        // A piece that comes late starts a little ahead of now, so that the ones after it
        // follow without a gap.
        next = Math.max(next, context.currentTime + LEAD)
        source.start(next)
        next += buffer.duration
    }
    const heard = new Channel<ArrayBuffer>()
    heard.onmessage = (bytes) => (rate === null ? void early.push(bytes) : play(bytes))
    try {
        rate = await invoke<number>('start_voice', { onSound: heard })
    } catch (err) {
        void context.close()
        throw fromApp(err)
    }
    early.splice(0).forEach(play)
    return {
        stream: out.stream,
        stop() {
            void invoke('stop_voice').catch(() => undefined)
            void context.close()
        },
    }
}

// Your picture for a call, small, as a tile is small. The window's own way of reaching a
// camera is used, in a browser and in the desktop app alike.
export async function captureCamera(): Promise<Captured> {
    if (!navigator.mediaDevices?.getUserMedia) throw new TakeRefused('unreachable', 'no way to reach a camera in this window')
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 } } }).catch((err) => {
        throw whyNot(err)
    })
    return { stream, stop: () => stream.getTracks().forEach((track) => track.stop()) }
}

export async function captureVoice(): Promise<Captured> {
    if (inDesktop()) return appVoice()
    if (!navigator.mediaDevices?.getUserMedia) throw new TakeRefused('unreachable', 'no way to reach a microphone in this window')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).catch((err) => {
        throw whyNot(err)
    })
    return { stream, stop: () => stream.getTracks().forEach((track) => track.stop()) }
}
