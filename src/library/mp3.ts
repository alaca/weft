import { giveTurn } from './turn'

// A recording as an MP3 file. The encoder is large and only needed here, so it is fetched when
// the first MP3 is made. A whole song takes it some seconds, so it is given a little of the
// sound at a time, and every few thousandths of a second the screen and the playing song get
// a turn. That is measured by the clock, because how long a stretch of sound takes depends on
// the machine and on the quality.
const FRAME = 1152
const FEED = FRAME * 4
const TURN_MS = 10
const FULL = 0x7fff

export async function encodeMp3(
    channels: Float32Array[],
    sampleRate: number,
    kbps: number,
    options: { length?: number; level?: number } = {},
    onProgress?: (done: number) => void,
): Promise<Uint8Array> {
    const { length = channels[0]?.length ?? 0, level = 1 } = options
    const { Mp3Encoder } = await import('@breezystack/lamejs')
    const encoder = new Mp3Encoder(channels.length, sampleRate, kbps)
    const parts: Uint8Array[] = []
    const whole = (channel: Float32Array, from: number, to: number) => {
        const out = new Int16Array(to - from)
        for (let at = from; at < to; at++) out[at - from] = Math.round(Math.max(-1, Math.min(1, channel[at] * level)) * FULL)
        return out
    }
    let since = performance.now()
    for (let from = 0; from < length; from += FEED) {
        const to = Math.min(length, from + FEED)
        const made = channels.length > 1 ? encoder.encodeBuffer(whole(channels[0], from, to), whole(channels[1], from, to)) : encoder.encodeBuffer(whole(channels[0], from, to))
        if (made.length) parts.push(new Uint8Array(made))
        if (to < length && performance.now() - since < TURN_MS) continue
        onProgress?.(to / length)
        await giveTurn()
        since = performance.now()
    }
    const rest = encoder.flush()
    if (rest.length) parts.push(new Uint8Array(rest))
    const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
    let at = 0
    for (const part of parts) {
        bytes.set(part, at)
        at += part.length
    }
    return bytes
}
