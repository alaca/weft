import { formatGrid, type GridRow } from './grid'
import { formatNoteGrid, type Note } from './notes'
import { noteNameToMidi } from './pitch'
import type { TextEdit } from './types'

export type StarterKind = 'drums' | 'bass' | 'chords' | 'melody' | 'emptyDrums' | 'emptyNotes'

export const PATTERN_STARTERS: { kind: StarterKind; label: string; name: string }[] = [
    { kind: 'drums', label: 'Drums', name: 'drums' },
    { kind: 'bass', label: 'Bass line', name: 'bass' },
    { kind: 'chords', label: 'Chords', name: 'chords' },
    { kind: 'melody', label: 'Melody', name: 'melody' },
    { kind: 'emptyDrums', label: 'Empty drums', name: 'drums' },
    { kind: 'emptyNotes', label: 'Empty notes', name: 'notes' },
]

const KIT = 'RolandTR909'

const hits = (sound: string, steps: string): GridRow => ({ sound, steps: [...steps].map((step) => step === 'x') })
const tune = (...notes: [name: string, start: number, length: number][]): Note[] =>
    notes.map(([name, start, length]) => ({ midi: noteNameToMidi(name) ?? 60, start, length }))

const DRUMS = [hits('bd', 'x...x...x...x...'), hits('cp', '....x.......x...'), hits('hh', '..x...x...x...x.')]
const BASS = tune(['d2', 0, 2], ['d2', 3, 1], ['f2', 6, 1], ['d2', 8, 2], ['a1', 12, 2], ['c2', 14, 2])
const MELODY = tune(['a4', 0, 2], ['f4', 3, 1], ['d4', 4, 2], ['f4', 8, 1], ['g4', 10, 1], ['a4', 11, 1], ['c5', 12, 3])
const CHORDS = tune(
    ['d3', 0, 4],
    ['f3', 0, 4],
    ['a3', 0, 4],
    ['d3', 4, 4],
    ['f3', 4, 4],
    ['a#3', 4, 4],
    ['c3', 8, 4],
    ['f3', 8, 4],
    ['a3', 8, 4],
    ['c3', 12, 4],
    ['e3', 12, 4],
    ['g3', 12, 4],
)

export function starterCode(kind: StarterKind, name: string): string {
    switch (kind) {
        case 'drums':
            return `${name}: s(${formatGrid(DRUMS)})\n  .bank("${KIT}")`
        case 'bass':
            return `${name}: note(${formatNoteGrid(BASS, 16)})\n  .s("sawtooth")\n  .lpf(slider(900, 100, 8000))`
        case 'chords':
            return `${name}: note(${formatNoteGrid(CHORDS, 16)}).slow(4)\n  .s("gm_epiano1")\n  .room(slider(0.3, 0, 1))`
        case 'melody':
            return `${name}: note(${formatNoteGrid(MELODY, 16)})\n  .s("triangle")\n  .delay(slider(0.25, 0, 1))`
        case 'emptyDrums':
            return `${name}: s("~")\n  .bank("${KIT}")`
        case 'emptyNotes':
            return `${name}: note("~")\n  .s("triangle")`
    }
}

export function freeName(base: string, taken: string[]): string {
    const used = new Set(taken.map((name) => name.toLowerCase()))
    if (!used.has(base)) return base
    let count = 2
    while (used.has(`${base}${count}`)) count++
    return `${base}${count}`
}

export function appendPattern(code: string, text: string): TextEdit {
    const end = code.trimEnd().length
    return { from: end, to: code.length, insert: `${end ? '\n\n' : ''}${text}\n` }
}
