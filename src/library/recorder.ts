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

export async function startTake(): Promise<Take> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('this machine does not let the app record')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
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
