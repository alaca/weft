import { TakeRefused, whyNot } from '../library/recorder'

// Your voice for a call, as a stream the call can send. In a browser the window's own way of
// reaching a microphone is used, with the machine's tidying up of a voice switched on. In the
// desktop app the app itself listens, as it does for a take, and hands what it hears to the
// window a little at a time; here that is laid end to end into a stream.
export type Captured = { stream: MediaStream; stop(): void }

const LEAD = 0.06
// The furthest a voice is let to fall behind, in seconds. A change to a heavy song holds the
// window several times in a row, for about 0.3 s in all, and a piece needs more than one free
// turn of the window to get through, so the pieces of all that time arrive at its end. There
// is room for those, or a voice would be cut at every such change.
const BEHIND = 0.36
const inDesktop = () => '__TAURI_INTERNALS__' in window

// When a piece of a voice is to sound: right after the piece before it, or a little ahead of
// now when it comes late, so that the ones after it follow without a gap. What a late piece
// loses is never made up, and after a standstill of the window the pieces of that time come
// all at once. So a piece that would sound further from now than a voice may fall behind is
// left out: a short cut in the voice, in place of a voice that stays late.
export function pieceStart(next: number, now: number): number | null {
    return next - now > BEHIND ? null : Math.max(next, now + LEAD)
}

function fromApp(err: unknown): TakeRefused {
    const said = String((err as Error)?.message ?? err)
    return new TakeRefused(said === 'missing' ? 'missing' : 'other', said)
}

async function appVoice(input: string | null): Promise<Captured> {
    const { invoke, Channel } = await import('@tauri-apps/api/core')
    const context = new AudioContext()
    const out = context.createMediaStreamDestination()
    let rate: number | null = null
    let next = 0
    const early: ArrayBuffer[] = []
    const play = (bytes: ArrayBuffer) => {
        const samples = new Float32Array(bytes)
        if (!samples.length || rate === null) return
        const at = pieceStart(next, context.currentTime)
        if (at === null) return
        const buffer = context.createBuffer(1, samples.length, rate)
        buffer.copyToChannel(samples, 0)
        const source = context.createBufferSource()
        source.buffer = buffer
        source.connect(out)
        source.start(at)
        next = at + buffer.duration
    }
    const heard = new Channel<ArrayBuffer>()
    heard.onmessage = (bytes) => (rate === null ? void early.push(bytes) : play(bytes))
    try {
        rate = await invoke<number>('start_voice', { device: input, onSound: heard })
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

// `input` is the microphone chosen in the sound settings, as for a take.
export async function captureVoice(input: string | null = null): Promise<Captured> {
    if (inDesktop()) return appVoice(input)
    if (!navigator.mediaDevices?.getUserMedia) throw new TakeRefused('unreachable', 'no way to reach a microphone in this window')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(input ? { deviceId: { ideal: input } } : {}), echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).catch((err) => {
        throw whyNot(err)
    })
    return { stream, stop: () => stream.getTracks().forEach((track) => track.stop()) }
}
