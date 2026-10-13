// A MIDI file, the kind every music program reads and writes: the notes of a song, track by
// track, with its tempo and how its bar is counted, and no sound at all. Here it is read into
// and written from something plain: where a note begins and how long it is are counted in
// ticks, of which a quarter note has `ppq`.
export type MidiNote = { tick: number; length: number; note: number; force: number }
// The channel counts from 0. Channel 9 is the drums, by an agreement all machines keep.
export type MidiTrack = { name: string; channel: number; notes: MidiNote[] }
export type MidiSong = { ppq: number; tempos: { tick: number; bpm: number }[]; meter: [number, number]; tracks: MidiTrack[] }

export const DRUM_CHANNEL = 9

const text = (value: string): number[] => [...new TextEncoder().encode(value)]
const u32 = (value: number): number[] => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
const u16 = (value: number): number[] => [(value >>> 8) & 255, value & 255]

// A length of time or of data, written in as few bytes as it takes, seven bits to a byte.
function varLen(value: number): number[] {
    const bytes = [value & 0x7f]
    for (let rest = value >>> 7; rest > 0; rest >>>= 7) bytes.unshift((rest & 0x7f) | 0x80)
    return bytes
}

type Timed = { tick: number; order: number; bytes: number[] }

function chunk(events: Timed[]): number[] {
    const data: number[] = []
    let at = 0
    for (const event of [...events].sort((a, b) => a.tick - b.tick || a.order - b.order)) {
        data.push(...varLen(Math.max(0, event.tick - at)), ...event.bytes)
        at = Math.max(at, event.tick)
    }
    data.push(0, 0xff, 0x2f, 0)
    return [...text('MTrk'), ...u32(data.length), ...data]
}

const meta = (kind: number, data: number[]): number[] => [0xff, kind, ...varLen(data.length), ...data]
const whole = (value: number, least: number, most: number) => Math.min(most, Math.max(least, Math.round(value)))

export function writeMidiFile(song: MidiSong): Uint8Array {
    const [beats, unit] = song.meter
    const first: Timed[] = [
        { tick: 0, order: 0, bytes: meta(0x58, [whole(beats, 1, 255), Math.round(Math.log2(unit)), 24, 8]) },
        ...song.tempos.map(({ tick, bpm }) => {
            const micros = whole(60_000_000 / Math.max(1, bpm), 1, 0xffffff)
            return { tick: whole(tick, 0, 0x0fffffff), order: 1, bytes: meta(0x51, [(micros >> 16) & 255, (micros >> 8) & 255, micros & 255]) }
        }),
    ]
    const tracks = song.tracks.map((track) => {
        const channel = whole(track.channel, 0, 15)
        const events: Timed[] = [{ tick: 0, order: 0, bytes: meta(0x03, text(track.name).slice(0, 120)) }]
        for (const note of track.notes) {
            const tick = whole(note.tick, 0, 0x0fffffff)
            const key = whole(note.note, 0, 127)
            // A note that ends where another begins is ended first.
            events.push({ tick, order: 2, bytes: [0x90 | channel, key, whole(note.force, 1, 127)] })
            events.push({ tick: tick + whole(note.length, 1, 0x0fffffff), order: 1, bytes: [0x80 | channel, key, 0] })
        }
        return chunk(events)
    })
    return new Uint8Array([...text('MThd'), ...u32(6), ...u16(1), ...u16(tracks.length + 1), ...u16(whole(song.ppq, 1, 0x7fff)), ...chunk(first), ...tracks.flat()])
}

// Null when the bytes are no MIDI file, or one that counts time in frames of film, which is
// not a song counted in bars.
export function readMidiFile(bytes: Uint8Array): MidiSong | null {
    const said = (at: number, word: string) => word.split('').every((letter, i) => bytes[at + i] === letter.charCodeAt(0))
    const long = (at: number) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0
    const short = (at: number) => (bytes[at] << 8) | bytes[at + 1]
    if (bytes.length < 14 || !said(0, 'MThd') || long(4) < 6) return null
    const ppq = short(12)
    if (!ppq || ppq & 0x8000) return null
    const tempos: MidiSong['tempos'] = []
    let meter: [number, number] | null = null
    const tracks: MidiTrack[] = []
    let at = 8 + long(4)
    while (at + 8 <= bytes.length) {
        const size = long(at + 4)
        const from = at + 8
        const to = Math.min(bytes.length, from + size)
        at = to
        if (!said(from - 8, 'MTrk')) continue
        let name = ''
        let tick = 0
        let status = 0
        let here = from
        const number = (): number => {
            let value = 0
            for (let count = 0; count < 4 && here < to; count++) {
                const byte = bytes[here++]
                value = (value << 7) | (byte & 0x7f)
                if (!(byte & 0x80)) break
            }
            return value
        }
        // The notes of each channel apart: one track of a file can hold several instruments.
        const perChannel = new Map<number, MidiNote[]>()
        const sounding = new Map<string, MidiNote[]>()
        while (here < to) {
            tick += number()
            let first = bytes[here++]
            if (first === 0xff) {
                const kind = bytes[here++]
                const length = number()
                const data = bytes.subarray(here, here + length)
                here += length
                if (kind === 0x51 && length >= 3) tempos.push({ tick, bpm: 60_000_000 / Math.max(1, (data[0] << 16) | (data[1] << 8) | data[2]) })
                else if (kind === 0x58 && length >= 2 && !meter) meter = [data[0], 2 ** data[1]]
                else if (kind === 0x03 && !name) name = new TextDecoder().decode(data).trim()
                continue
            }
            if (first === 0xf0 || first === 0xf7) {
                here += number()
                continue
            }
            // A byte that is no status goes with the status before it.
            if (first & 0x80) status = first
            else here--
            first = status
            const kind = first & 0xf0
            const channel = first & 0x0f
            const one = bytes[here++]
            const two = kind === 0xc0 || kind === 0xd0 ? 0 : bytes[here++]
            if (kind !== 0x90 && kind !== 0x80) continue
            const key = `${channel}:${one}`
            if (kind === 0x90 && two > 0) {
                const note: MidiNote = { tick, length: 0, note: one, force: two }
                sounding.set(key, [...(sounding.get(key) ?? []), note])
                perChannel.set(channel, [...(perChannel.get(channel) ?? []), note])
            } else {
                const begun = sounding.get(key)?.shift()
                if (begun) begun.length = Math.max(1, tick - begun.tick)
            }
        }
        for (const [channel, notes] of [...perChannel].sort((a, b) => a[0] - b[0])) {
            // A note that was never ended is a quarter note long.
            for (const note of notes) if (!note.length) note.length = ppq
            tracks.push({ name, channel, notes })
        }
    }
    return { ppq, tempos: tempos.sort((a, b) => a.tick - b.tick), meter: meter ?? [4, 4], tracks }
}
