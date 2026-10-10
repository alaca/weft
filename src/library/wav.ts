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

export function encodeWav(channels: Float32Array[], sampleRate: number, options: { length?: number; level?: number; depth?: Depth } = {}): Uint8Array {
    const { length = channels[0]?.length ?? 0, level = 1, depth = 16 } = options
    const count = channels.length
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
    const full = depth === 16 ? 0x7fff : 0x7fffff
    let at = HEADER
    for (let sample = 0; sample < length; sample++) {
        for (let channel = 0; channel < count; channel++) {
            const value = Math.max(-1, Math.min(1, channels[channel][sample] * level))
            if (depth === 32) {
                view.setFloat32(at, value, true)
            } else if (depth === 16) {
                view.setInt16(at, Math.round(value * full), true)
            } else {
                const whole = Math.round(value * full)
                view.setUint8(at, whole & 0xff)
                view.setUint8(at + 1, (whole >> 8) & 0xff)
                view.setUint8(at + 2, (whole >> 16) & 0xff)
            }
            at += width
        }
    }
    return bytes
}

const UNSAFE = /[\\/:*?"<>|\u0000-\u001f]/g

export function fileName(song: string, extension: string): string {
    const clean = song.replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '')
    return `${clean || 'Song'}.${extension}`
}
