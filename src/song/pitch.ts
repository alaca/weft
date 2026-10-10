const NOTE = /^([a-gA-G])([#bsf]*)(-?\d+)?$/
const SEMITONES: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }

export function noteNameToMidi(name: string): number | null {
    const match = NOTE.exec(name)
    if (!match) return null
    const accidentals = [...match[2]].reduce((sum, ch) => sum + (ch === '#' || ch === 's' ? 1 : -1), 0)
    const octave = match[3] === undefined ? 3 : Number(match[3])
    return (octave + 1) * 12 + SEMITONES[match[1].toLowerCase()] + accidentals
}
