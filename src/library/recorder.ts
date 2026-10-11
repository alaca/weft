// A take from the microphone, as a file like any other audio file. The machine's own way of
// tidying up a voice for a phone call is switched off, because it thins out singing and claps.
export type Take = { stop(): Promise<File | null>; cancel(): void }

const ENDINGS: [type: string, ending: string][] = [
    ['webm', 'webm'],
    ['mp4', 'm4a'],
    ['ogg', 'ogg'],
    ['wav', 'wav'],
]

const endingOf = (type: string) => ENDINGS.find(([part]) => type.includes(part))?.[1] ?? 'webm'

// Why a take could not be started, said so that there is something to do about it.
export type NoTake = 'unreachable' | 'refused' | 'missing' | 'other'

export class TakeRefused extends Error {
    constructor(
        readonly why: NoTake,
        message: string,
    ) {
        super(message)
    }
}

export function whyNot(err: unknown): TakeRefused {
    if (err instanceof TakeRefused) return err
    const name = (err as { name?: string })?.name ?? ''
    const said = String((err as Error)?.message ?? err)
    if (name === 'NotAllowedError' || name === 'SecurityError') return new TakeRefused('refused', said)
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return new TakeRefused('missing', said)
    return new TakeRefused('other', said)
}

export async function startTake(): Promise<Take> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new TakeRefused('unreachable', 'no way to record in this window')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).catch((err) => {
        throw whyNot(err)
    })
    const recorder = new MediaRecorder(stream)
    const parts: Blob[] = []
    recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size) parts.push(event.data)
    })
    const release = () => stream.getTracks().forEach((track) => track.stop())
    recorder.start()
    return {
        stop: () =>
            new Promise((resolve) => {
                recorder.addEventListener(
                    'stop',
                    () => {
                        release()
                        const type = recorder.mimeType || parts[0]?.type || 'audio/webm'
                        resolve(parts.length ? new File(parts, `recording.${endingOf(type)}`, { type }) : null)
                    },
                    { once: true },
                )
                recorder.stop()
            }),
        cancel() {
            if (recorder.state !== 'inactive') recorder.stop()
            release()
        },
    }
}
