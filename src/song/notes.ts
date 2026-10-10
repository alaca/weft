import { lengthEdits } from './grid'
import { noteNameToMidi } from './pitch'
import type { Call, PatternBlock, TextEdit } from './types'
import { noteName } from './view'

export type Note = { start: number; length: number; midi: number }
export type NoteRef = { start: number; midi: number }
export type NoteGrid = { notes: Note[]; steps: number; cycles: number; perCycle: number }
export type NoteSource = { grid: NoteGrid; from: number; to: number; slow: Call | null }

export const NOTE_RESOLUTIONS = [4, 8, 16, 32]

// Silence fits every grid. It gets the one an empty roll is drawn with.
const EMPTY_STEPS = 16

const MAX_STEPS = 128
const NAME = /^[a-gA-G][#bsf]*-?\d+$/

const inOrder = (notes: Note[]): Note[] => [...notes].sort((a, b) => a.start - b.start || a.midi - b.midi)
const same = (note: Note, ref: NoteRef) => note.start === ref.start && note.midi === ref.midi
const overlap = (a: Note, b: Note) => a.midi === b.midi && a.start < b.start + b.length && b.start < a.start + a.length

export function parseNoteGrid(text: string): { notes: Note[]; steps: number } | null {
    const lines = text.split(',').map((line) => line.trim().split(/\s+/).filter(Boolean))
    const steps = lines[0]?.length ?? 0
    if (!steps || steps % 4 !== 0 || steps > MAX_STEPS) return null
    const notes: Note[] = []
    for (const cells of lines) {
        if (cells.length !== steps) return null
        let held: Note | null = null
        let sounded = false
        for (let i = 0; i < steps; i++) {
            const cell = cells[i]
            if (cell === '_') {
                if (i === 0) return null
                if (held) held.length++
                continue
            }
            held = null
            if (cell === '~') continue
            const midi = NAME.test(cell) ? noteNameToMidi(cell) : null
            if (midi === null) return null
            held = { start: i, length: 1, midi }
            notes.push(held)
            sounded = true
        }
        if (!sounded) return null
    }
    return { notes: inOrder(notes), steps }
}

export function formatNoteGrid(notes: Note[], steps: number): string {
    if (!notes.length) return '"~"'
    const voices: Note[][] = []
    for (const note of inOrder(notes)) {
        const voice = voices.find((line) => {
            const last = line[line.length - 1]
            return last.start + last.length <= note.start
        })
        if (voice) voice.push(note)
        else voices.push([note])
    }
    const rows = voices.map((voice) => {
        const cells = Array<string>(steps).fill('~')
        for (const note of voice) {
            cells[note.start] = noteName(note.midi)
            for (let i = 1; i < note.length && note.start + i < steps; i++) cells[note.start + i] = '_'
        }
        return cells
    })
    const width = Math.max(...rows.flat().map((cell) => cell.length))
    const lines = rows.map((cells) => {
        const groups: string[] = []
        for (let i = 0; i < cells.length; i += 4) {
            groups.push(
                cells
                    .slice(i, i + 4)
                    .map((cell) => cell.padEnd(width))
                    .join(' '),
            )
        }
        return `  ${groups.join('   ').trimEnd()}`
    })
    return `\`\n${lines.join(' ,\n')}\n\``
}

export function noteText(block: PatternBlock): { text: string; from: number; to: number } | null {
    const source = block.calls[0]
    const arg = source?.args[0]
    if (!source || source.name !== 'note' || source.args.length !== 1 || !arg || arg.kind !== 'string') return null
    return { text: arg.value, from: arg.from, to: arg.to }
}

export function readNotes(block: PatternBlock): NoteSource | null {
    const text = noteText(block)
    const parsed = text ? parseNoteGrid(text.text) : null
    if (!text || !parsed) return null
    const next = block.calls[1]
    const slow = next?.name === 'slow' ? next : null
    const arg = slow?.args[0]
    if (slow && !(arg && arg.kind === 'number' && Number.isInteger(arg.value) && arg.value >= 1)) return null
    const cycles = arg && arg.kind === 'number' ? arg.value : 1
    if (parsed.steps % cycles !== 0) return null
    return { grid: { notes: parsed.notes, steps: parsed.steps, cycles, perCycle: parsed.steps / cycles }, from: text.from, to: text.to, slow }
}

function fits(notes: Note[], candidate: Note, skip: number, steps: number): boolean {
    if (candidate.start < 0 || candidate.length < 1 || candidate.start + candidate.length > steps) return false
    if (candidate.midi < 0 || candidate.midi > 127) return false
    return !notes.some((note, i) => i !== skip && overlap(note, candidate))
}

export function addNote(notes: Note[], note: Note, steps: number): Note[] | null {
    const candidate = { ...note, length: Math.min(note.length, steps - note.start) }
    return fits(notes, candidate, -1, steps) ? inOrder([...notes, candidate]) : null
}

export function removeNote(notes: Note[], ref: NoteRef): Note[] {
    return notes.filter((note) => !same(note, ref))
}

function replace(notes: Note[], ref: NoteRef, change: (note: Note) => Note, steps: number): Note[] | null {
    const at = notes.findIndex((note) => same(note, ref))
    if (at < 0) return null
    const candidate = change(notes[at])
    return fits(notes, candidate, at, steps) ? inOrder(notes.map((note, i) => (i === at ? candidate : note))) : null
}

export function moveNote(notes: Note[], ref: NoteRef, to: NoteRef, steps: number): Note[] | null {
    return replace(notes, ref, (note) => ({ ...note, start: to.start, midi: to.midi }), steps)
}

export function resizeNote(notes: Note[], ref: NoteRef, length: number, steps: number): Note[] | null {
    return replace(notes, ref, (note) => ({ ...note, length }), steps)
}

export function resizeNotes(grid: NoteGrid, cycles: number): Note[] {
    const total = grid.perCycle * cycles
    const repeats = Math.ceil(total / grid.steps)
    const all = Array.from({ length: repeats }, (_, k) => grid.notes.map((note) => ({ ...note, start: note.start + k * grid.steps }))).flat()
    return inOrder(all.filter((note) => note.start < total).map((note) => ({ ...note, length: Math.min(note.length, total - note.start) })))
}

export function resampleNotes(grid: NoteGrid, perCycle: number): Note[] | null {
    const factor = perCycle / grid.perCycle
    const scaled = grid.notes.map((note) => ({ ...note, start: note.start * factor, length: note.length * factor }))
    return scaled.every((note) => Number.isInteger(note.start) && Number.isInteger(note.length) && note.length >= 1) ? scaled : null
}

type Sounded = { start: number; length: number; value: unknown }

export function notesFromEvents(cycles: Sounded[][]): { notes: Note[]; cycles: number; perCycle: number } | null {
    const key = (events: Sounded[]) =>
        events
            .map((event) => `${event.start.toFixed(6)}:${event.length.toFixed(6)}:${String(event.value)}`)
            .sort()
            .join('|')
    const keys = cycles.map(key)
    const period = [1, 2, 4].find((length) => length * 2 <= cycles.length && keys.every((value, i) => value === keys[i % length]))
    if (!period) return null
    const events = cycles.slice(0, period).flatMap((list, cycle) => list.map((event) => ({ ...event, start: event.start + cycle })))
    if (!events.length) return { notes: [], cycles: 1, perCycle: EMPTY_STEPS }
    const onGrid = (value: number, perCycle: number) => Math.abs(value * perCycle - Math.round(value * perCycle)) < 1e-6
    const perCycle = NOTE_RESOLUTIONS.find((candidate) => events.every((event) => onGrid(event.start, candidate) && onGrid(event.length, candidate)))
    if (!perCycle) return null
    const steps = perCycle * period
    const notes: Note[] = []
    for (const event of events) {
        const midi = typeof event.value === 'number' ? event.value : typeof event.value === 'string' ? noteNameToMidi(event.value) : null
        if (midi === null || !Number.isInteger(midi)) return null
        const start = Math.round(event.start * perCycle)
        notes.push({ start, length: Math.max(1, Math.min(Math.round(event.length * perCycle), steps - start)), midi })
    }
    return { notes: inOrder(notes), cycles: period, perCycle }
}

export function noteEdits(block: PatternBlock, source: NoteSource, notes: Note[], steps: number, cycles: number): TextEdit[] {
    return [{ from: source.from, to: source.to, insert: formatNoteGrid(notes, steps) }, ...lengthEdits(block, source.slow, cycles)]
}
