// The key a song is in: a note to start from and a scale. It is a help for the piano roll, which
// then only offers the notes of the key. It changes nothing in the code and nothing that is heard.
export type ScaleKind = 'major' | 'minor' | 'majorPentatonic' | 'minorPentatonic' | 'blues' | 'dorian'
export type Key = { root: number; kind: ScaleKind }

export const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export const SCALES: Record<ScaleKind, { label: string; steps: number[] }> = {
    major: { label: 'Major', steps: [0, 2, 4, 5, 7, 9, 11] },
    minor: { label: 'Minor', steps: [0, 2, 3, 5, 7, 8, 10] },
    majorPentatonic: { label: 'Major pentatonic', steps: [0, 2, 4, 7, 9] },
    minorPentatonic: { label: 'Minor pentatonic', steps: [0, 3, 5, 7, 10] },
    blues: { label: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
    dorian: { label: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
}

export const SCALE_KINDS = Object.keys(SCALES) as ScaleKind[]

const OCTAVE = 12
const fromRoot = (midi: number, key: Key) => (((midi - key.root) % OCTAVE) + OCTAVE) % OCTAVE

export const inKey = (midi: number, key: Key | null): boolean => key === null || SCALES[key.kind].steps.includes(fromRoot(midi, key))

// The note of the key closest to this one. Between two that are as close, the lower.
export function nearestInKey(midi: number, key: Key | null): number {
    if (inKey(midi, key)) return midi
    for (let away = 1; away < OCTAVE; away++) {
        if (inKey(midi - away, key)) return midi - away
        if (inKey(midi + away, key)) return midi + away
    }
    return midi
}

// The next note of the key above or below, for moving a note with the arrow keys.
export function stepInKey(midi: number, direction: 1 | -1, key: Key | null): number {
    for (let next = midi + direction; Math.abs(next - midi) <= OCTAVE; next += direction) {
        if (inKey(next, key)) return next
    }
    return midi + direction
}

export const keyText = (key: Key): string => `${ROOTS[key.root]} ${SCALES[key.kind].label.toLowerCase()}`

// How a key is kept with a song: "9:minor".
export const writeKey = (key: Key | null): string | null => (key ? `${key.root}:${key.kind}` : null)

export function readKey(text: unknown): Key | null {
    if (typeof text !== 'string') return null
    const [root, kind] = text.split(':')
    const at = Number(root)
    return Number.isInteger(at) && at >= 0 && at < OCTAVE && SCALE_KINDS.includes(kind as ScaleKind) ? { root: at, kind: kind as ScaleKind } : null
}
