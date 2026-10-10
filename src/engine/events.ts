import type { PatternEvent } from '../song/types'

export type HapLike = {
    whole?: { begin: { valueOf(): number }; end: { valueOf(): number } }
    hasOnset(): boolean
    value: unknown
}

const NOTE = /^([a-gA-G])([#bsf]*)(-?\d+)?$/
const SEMITONES: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }

export function noteNameToMidi(name: string): number | null {
    const match = NOTE.exec(name)
    if (!match) return null
    const accidentals = [...match[2]].reduce((sum, ch) => sum + (ch === '#' || ch === 's' ? 1 : -1), 0)
    const octave = match[3] === undefined ? 3 : Number(match[3])
    return (octave + 1) * 12 + SEMITONES[match[1].toLowerCase()] + accidentals
}

function pitchOf(value: unknown): number | null {
    if (typeof value !== 'object' || value === null) return null
    const v = value as { note?: unknown; freq?: unknown }
    if (typeof v.note === 'number') return v.note
    if (typeof v.note === 'string') return noteNameToMidi(v.note)
    if (typeof v.freq === 'number') return 69 + 12 * Math.log2(v.freq / 440)
    return null
}

function soundOf(value: unknown): string | null {
    if (typeof value !== 'object' || value === null) return null
    const s = (value as { s?: unknown }).s
    return typeof s === 'string' ? s : null
}

export function toEvents(haps: HapLike[], cycle: number): PatternEvent[] {
    const events: PatternEvent[] = []
    for (const hap of haps) {
        if (!hap.whole || !hap.hasOnset()) continue
        const begin = hap.whole.begin.valueOf()
        if (begin < cycle || begin >= cycle + 1) continue
        events.push({
            start: begin - cycle,
            length: hap.whole.end.valueOf() - begin,
            sound: soundOf(hap.value),
            midi: pitchOf(hap.value),
        })
    }
    return events
}
