// What two people in a jam send each other, and the little of it that the relay between them
// reads. The relay hands on everything in `told` and every piece of a sound without looking.
export type SentUpdate = { by: string; changes: unknown; heard?: true }

export type Bars = { from: number; to: number }
export type Transport =
    | { k: 'play'; at: number }
    | { k: 'pause'; at: number }
    | { k: 'stop' }
    | { k: 'start'; bar: number }
    | { k: 'loop'; range: Bars | null }
    | { k: 'mode'; mode: 'song' | 'live' }

export type Offer = { k: 'offer'; name: string; digest: string; file: string; type: string; seconds: number; bytes: number }

export type Told =
    | { k: 'song'; name: string; code: string; keys: Record<string, string>; start: number; loop: Bars | null; mode: 'song' | 'live' }
    | { k: 'say'; text: string }
    | Transport
    | { k: 'ping'; n: number }
    | { k: 'pong'; n: number; at: number | null }
    | { k: 'where' }
    | Offer
    | { k: 'want'; name: string }
    | { k: 'rtc'; sdp: RTCSessionDescriptionInit }
    | { k: 'ice'; candidate: RTCIceCandidateInit | null }
    | { k: 'mic'; on: boolean }
    | { k: 'cam'; on: boolean }
    | { k: 'call' }

// A jam whose maker said that anyone may ask to join it, as the list of them tells it: a name,
// and how big the song is. Nothing of the song itself.
export type OpenJam = { id: string; name: string; bpm: number | null; patterns: number; since: number }
export type About = { bpm: number | null; patterns: number }
export type Answer = 'let' | 'deny' | 'block'

export type FromRelay =
    | { t: 'invite'; code: string; id: string }
    | { t: 'joined'; name: string }
    | { t: 'in'; name: string }
    | { t: 'no'; why: 'code' | 'full' | 'gone' | 'declined' | 'busy' | 'quiet' }
    | { t: 'asked'; ask: string; name: string }
    | { t: 'unasked'; ask: string }
    | { t: 'updates'; updates: SentUpdate[] }
    | { t: 'told'; d: Told }
    | { t: 'over'; why: 'left' | 'expired' }

export const NAME_LIMIT = 24
export const SAY_LIMIT = 500
export const PIECE = 128 * 1024
export const SOUND_LIMIT = 32 * 1024 * 1024

export const cleanName = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, NAME_LIMIT)
export const cleanSay = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, SAY_LIMIT)

// An invite is six letters and digits, none of which is mistaken for another when read aloud
// or typed, shown in two halves.
export const showInvite = (code: string): string => `${code.slice(0, 3)}-${code.slice(3)}`

// What was typed or pasted as an invite: the code alone, in either case, with or without the
// dash, or a line of text that ends with it. Null when there is no invite in it.
export function readInvite(text: string): string | null {
    const found = text.toUpperCase().match(/(?:^|[^A-Z0-9])([A-HJ-NP-Z2-9]{3})[\s-]?([A-HJ-NP-Z2-9]{3})\s*$/)
    return found ? found[1] + found[2] : null
}

// Where the list of open jams is read, from where the relay is reached.
export const listAddress = (relay: string): string => `${relay.replace(/^ws/, 'http').replace(/\/+$/, '')}/jams`

// The list as it came over the network, with everything left out that is not what a list holds.
export function readOpenJams(value: unknown): OpenJam[] {
    const jams = (value as { jams?: unknown } | null)?.jams
    if (!Array.isArray(jams)) return []
    const read: OpenJam[] = []
    for (const one of jams as Partial<OpenJam>[]) {
        if (!one || typeof one.id !== 'string' || !/^[0-9a-f]{6,32}$/.test(one.id)) continue
        const name = cleanName(String(one.name ?? ''))
        if (!name) continue
        const bpm = Number(one.bpm)
        const patterns = Number(one.patterns)
        read.push({ id: one.id, name, bpm: one.bpm !== null && Number.isFinite(bpm) && bpm >= 1 && bpm <= 999 ? Math.round(bpm) : null, patterns: Number.isInteger(patterns) && patterns > 0 ? Math.min(patterns, 999) : 0, since: Number(one.since) || 0 })
    }
    return read
}

// What the list says under a name.
export function aboutText(jam: About): string {
    const patterns = jam.patterns === 1 ? '1 pattern' : `${jam.patterns} patterns`
    if (!jam.patterns) return 'Just started'
    return jam.bpm ? `${jam.bpm} bpm, ${patterns}` : patterns
}

// A sound goes over in pieces, so that a long one does not hold up the changes and the chat
// that travel on the same line. Each piece says which sound it is of and which piece of how many.
export type Piece = { name: string; part: number; parts: number; bytes: Uint8Array }

export const piecesOf = (bytes: number): number => Math.max(1, Math.ceil(bytes / PIECE))

export function packPiece(piece: Piece): Uint8Array {
    const note = new TextEncoder().encode(JSON.stringify({ name: piece.name, part: piece.part, parts: piece.parts }))
    const frame = new Uint8Array(2 + note.length + piece.bytes.length)
    frame[0] = note.length >> 8
    frame[1] = note.length & 0xff
    frame.set(note, 2)
    frame.set(piece.bytes, 2 + note.length)
    return frame
}

export function readPiece(frame: ArrayBuffer): Piece | null {
    const all = new Uint8Array(frame)
    if (all.length < 2) return null
    const length = (all[0] << 8) | all[1]
    if (all.length < 2 + length) return null
    try {
        const note = JSON.parse(new TextDecoder().decode(all.subarray(2, 2 + length))) as Partial<Piece>
        if (typeof note.name !== 'string' || !Number.isInteger(note.part) || !Number.isInteger(note.parts)) return null
        if (note.parts! < 1 || note.part! < 0 || note.part! >= note.parts!) return null
        return { name: note.name, part: note.part!, parts: note.parts!, bytes: all.subarray(2 + length) }
    } catch {
        return null
    }
}

// Two sounds with the same name are the same sound when this says the same of both.
export async function digestOf(data: ArrayBuffer): Promise<string> {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
    return Array.from(hash.subarray(0, 12), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

// How far apart two clocks of the same song may run before the one that follows is set right:
// far enough that it is not done for nothing, near enough that both hear the same beat.
export const DRIFT = 0.04

// Where the other's song is now, from where it said it was and how long the saying took.
export const arrivedAt = (at: number, roundTripMs: number, bpm: number): number => at + (roundTripMs / 2000) * (bpm / 240)
