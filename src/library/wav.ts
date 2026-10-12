import { turnWhenDue } from './turn'

// A recording as a WAV file, the channels side by side: whole numbers of 16 or 24 bits a
// sample, or 32 bit floating point.
export type Depth = 16 | 24 | 32

const HEADER = 44
const QUIET = 0.0005
const HEADROOM = 0.99
const FLOAT_FORMAT = 3
const WHOLE_FORMAT = 1

// Where the sound ends, with a little room after it: the last sample that is not silence.
export function soundingLength(channels: Float32Array[], sampleRate: number, least = 0): number {
    const length = channels[0]?.length ?? 0
    let last = -1
    for (const channel of channels) {
        for (let at = length - 1; at > last; at--) {
            if (Math.abs(channel[at]) > QUIET) {
                last = at
                break
            }
        }
    }
    return Math.min(length, Math.max(least, last + 1 + Math.round(sampleRate * 0.2)))
}

export function peakOf(channels: Float32Array[], length = channels[0]?.length ?? 0): number {
    let peak = 0
    for (const channel of channels) for (let at = 0; at < length; at++) peak = Math.max(peak, Math.abs(channel[at]))
    return peak
}

// A song louder than full level would be cut flat at the top, so it is turned down as a whole,
// just enough to fit. A quieter one is left as it is.
export const levelFor = (peak: number): number => (peak > 1 ? HEADROOM / peak : 1)

type Options = { length?: number; level?: number; depth?: Depth }

// The file with its head written and room for the samples after it.
function headed(count: number, sampleRate: number, length: number, depth: Depth): Uint8Array {
    const width = depth / 8
    const size = length * count * width
    const bytes = new Uint8Array(HEADER + size)
    const view = new DataView(bytes.buffer)
    const text = (at: number, value: string) => [...value].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)))
    text(0, 'RIFF')
    view.setUint32(4, 36 + size, true)
    text(8, 'WAVE')
    text(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, depth === 32 ? FLOAT_FORMAT : WHOLE_FORMAT, true)
    view.setUint16(22, count, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * count * width, true)
    view.setUint16(32, count * width, true)
    view.setUint16(34, depth, true)
    text(36, 'data')
    view.setUint32(40, size, true)
    return bytes
}

// The samples from one place in the sound up to another, written where they belong in the file.
// They go in a channel at a time, through a row of numbers laid over the file's own memory,
// and 24 bit ones a byte at a time: asking for every sample to be written by itself takes many
// times as long. Such a row keeps the low byte of a number first on every machine the app is
// made for, which is how a WAV file has it. The `| 0` says that the rounded number is a whole
// one: without it WebKit takes seven times as long over the 16 bit ones.
function write(bytes: Uint8Array, channels: Float32Array[], from: number, to: number, level: number, depth: Depth) {
    const count = channels.length
    for (let channel = 0; channel < count; channel++) {
        const heard = channels[channel]
        if (depth === 16) {
            const out = new Int16Array(bytes.buffer, HEADER)
            for (let sample = from, at = from * count + channel; sample < to; sample++, at += count) out[at] = Math.round(Math.max(-1, Math.min(1, heard[sample] * level)) * 0x7fff) | 0
        } else if (depth === 32) {
            const out = new Float32Array(bytes.buffer, HEADER)
            for (let sample = from, at = from * count + channel; sample < to; sample++, at += count) out[at] = Math.max(-1, Math.min(1, heard[sample] * level))
        } else {
            for (let sample = from, at = HEADER + (from * count + channel) * 3; sample < to; sample++, at += count * 3) {
                const whole = Math.round(Math.max(-1, Math.min(1, heard[sample] * level)) * 0x7fffff) | 0
                bytes[at] = whole
                bytes[at + 1] = whole >> 8
                bytes[at + 2] = whole >> 16
            }
        }
    }
}

export function encodeWav(channels: Float32Array[], sampleRate: number, options: Options = {}): Uint8Array {
    const { length = channels[0]?.length ?? 0, level = 1, depth = 16 } = options
    const bytes = headed(channels.length, sampleRate, length, depth)
    write(bytes, channels, 0, length, level, depth)
    return bytes
}

const STRETCH = 1 << 15

// The same file, written a stretch at a time, with a turn for the window whenever one is due.
// For a sound that is written while a song may be playing: a long one written in one go would
// make the song stumble.
export async function encodeWavInTurns(channels: Float32Array[], sampleRate: number, options: Options = {}): Promise<Uint8Array> {
    const { length = channels[0]?.length ?? 0, level = 1, depth = 16 } = options
    const bytes = headed(channels.length, sampleRate, length, depth)
    const turn = turnWhenDue()
    for (let from = 0; from < length; from += STRETCH) {
        write(bytes, channels, from, Math.min(length, from + STRETCH), level, depth)
        await turn()
    }
    return bytes
}

const UNSAFE = /[\\/:*?"<>|\u0000-\u001f]/g

export function fileName(song: string, extension: string): string {
    const clean = song.replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '')
    return `${clean || 'Song'}.${extension}`
}
