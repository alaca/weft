import { fitsBar, meterNow, noteSteps, USUAL, usualSteps } from './meter'
import { removeCall } from './edits'
import { groupOf, lengthEdits, LEVEL, stepKind } from './grid'
import { noteNameToMidi } from './pitch'
import type { Call, PatternBlock, TextEdit } from './types'
import { noteName } from './view'

// `level` is how loud the note is, as a hit of a drum grid has one: 1 where nothing says, which
// is how a note is written that was put in by hand. A note played on a keyboard has the level
// of how hard its key was pressed.
export type Note = { start: number; length: number; midi: number; level?: number }
export type NoteRef = { start: number; midi: number }
export type NoteGrid = { notes: Note[]; steps: number; cycles: number; perCycle: number }
// `levels` is the call that holds a level for every step, when the code has one. `otherLevel`
// says the code sets the level some other way, which is then left as it is.
export type NoteSource = { grid: NoteGrid; from: number; to: number; slow: Call | null; levels: Call | null; otherLevel: boolean }

// Twelve and twenty-four are for music counted in threes. They stand in order of fineness, and
// a pattern read from other code is put on the first of these that holds all its notes.
export const NOTE_RESOLUTIONS = [4, 8, 12, 16, 24, 32]

// Silence fits every grid. It gets the one an empty roll is drawn with.
// An empty roll has the steps a bar of the song usually has: sixteen in four quarters.
const emptySteps = (): number => usualSteps(meterNow())

const MAX_STEPS = 128
const NAME = /^[a-gA-G][#bsf]*-?\d+$/

const inOrder = (notes: Note[]): Note[] => [...notes].sort((a, b) => a.start - b.start || a.midi - b.midi)
const same = (note: Note, ref: NoteRef) => note.start === ref.start && note.midi === ref.midi
const overlap = (a: Note, b: Note) => a.midi === b.midi && a.start < b.start + b.length && b.start < a.start + a.length

export function parseNoteGrid(text: string): { notes: Note[]; steps: number } | null {
    const lines = text.split(',').map((line) => line.trim().split(/\s+/).filter(Boolean))
    const steps = lines[0]?.length ?? 0
    if (!steps || !fitsBar(steps) || steps > MAX_STEPS) return null
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
        // A single line of rests is an empty roll that keeps its number of steps.
        if (!sounded) return lines.length === 1 ? { notes: [], steps } : null
    }
    return { notes: inOrder(notes), steps }
}

// An empty roll of one bar on the usual sixteen steps is written as one rest. On any other
// number of steps, or over more bars, it is written as that many rests, or what was chosen
// would be forgotten with the last note.
export function formatNoteGrid(notes: Note[], steps: number, perCycle = steps): string {
    if (!notes.length) {
        if (steps === emptySteps() && perCycle === emptySteps()) return '"~"'
        const size = groupOf(steps)
        const groups = Array.from({ length: steps / size }, () => Array<string>(size).fill('~').join(' '))
        return `\`\n  ${groups.join('   ')}\n\``
    }
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
        const size = groupOf(cells.length)
        for (let i = 0; i < cells.length; i += size) {
            groups.push(
                cells
                    .slice(i, i + size)
                    .map((cell) => cell.padEnd(width))
                    .join(' '),
            )
        }
        return `  ${groups.join('   ').trimEnd()}`
    })
    return `\`\n${lines.join(' ,\n')}\n\``
}

// The level of the notes is written the way the level of a drum grid's hits is, as a number for
// every step after the notes:
//   note("c3 ~ e3 ~").postgain("1 1 0.6 1")
// Notes that start together have one level, since it is the step that has it. Over more bars
// than one the numbers stand in brackets, played as slowly as the notes: "[1 1 0.6 1 ...]/2".
// The call is only there when a note has another level than 1.
const LONG = /^\[([^\[\]]*)\]\s*\/\s*(\d+)$/
const MOST_LEVEL = stepKind('level').max

// How hard a key was pressed, from 0 to 1, as the level of its note. A key of a MIDI keyboard
// says it in 127 parts, and 100 of them are the level of a note put in by hand, as in most
// music programs.
export const levelOfForce = (force: number): number => Math.round(Math.min(1, Math.max(0, force)) * 127) / 100
export const forceOfLevel = (level: number): number => Math.min(127, Math.max(1, Math.round(level * 100)))

const fitLevel = (level: number): number => Number(Math.min(MOST_LEVEL, Math.max(0, level)).toFixed(2))
const levelled = (note: Note, level: number): Note => {
    const { level: _, ...rest } = note
    return level === 1 ? rest : { ...rest, level }
}

// The level a step has: that of the notes that start on it. Null where none does.
export function levelAt(notes: Note[], start: number): number | null {
    const there = notes.filter((note) => note.start === start)
    return there.length ? Math.max(...there.map((note) => note.level ?? 1)) : null
}

function readLevels(block: PatternBlock, steps: number, cycles: number): { call: Call | null; values: number[] | null } {
    const call = block.calls.find((one) => one.name === LEVEL) ?? null
    const arg = call?.args.length === 1 ? call.args[0] : undefined
    if (!call || !arg || arg.kind !== 'string') return { call, values: null }
    const long = LONG.exec(arg.value.trim())
    const values = (long ? long[1] : arg.value).trim().split(/\s+/).map(Number)
    const fits = values.length === steps && values.every((value) => Number.isFinite(value) && value >= 0) && (long ? Number(long[2]) : 1) === cycles
    return { call, values: fits ? values : null }
}

// The level of every step as it is written, in the groups the notes are written in. Null when
// every note has the level of a note put in by hand.
export function levelText(notes: Note[], steps: number, cycles: number): string | null {
    if (notes.every((note) => (note.level ?? 1) === 1)) return null
    const size = groupOf(steps)
    const groups: string[] = []
    for (let at = 0; at < steps; at += size) groups.push(Array.from({ length: Math.min(size, steps - at) }, (_, i) => String(levelAt(notes, at + i) ?? 1)).join(' '))
    const text = groups.join('   ')
    return cycles > 1 ? `[${text}]/${cycles}` : text
}

// A run of steps given a level each, from one step on: every note that starts on one of them
// is that loud. Null when nothing changes.
export function setLevels(notes: Note[], from: number, levels: number[]): Note[] | null {
    let changed = false
    const next = notes.map((note) => {
        const level = levels[note.start - from]
        if (level === undefined || fitLevel(level) === (note.level ?? 1)) return note
        changed = true
        return levelled(note, fitLevel(level))
    })
    return changed ? next : null
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
    const levels = readLevels(block, parsed.steps, cycles)
    const notes = levels.values ? parsed.notes.map((note) => levelled(note, fitLevel((levels.values as number[])[note.start]))) : parsed.notes
    return { grid: { notes, steps: parsed.steps, cycles, perCycle: parsed.steps / cycles }, from: text.from, to: text.to, slow, ...noteLevelsOf(block, parsed.steps, cycles) }
}

// What a pattern's code says of the level of its notes, for whoever reads the notes another way.
export function noteLevelsOf(block: PatternBlock, steps: number, cycles: number): { levels: Call | null; otherLevel: boolean } {
    const { call, values } = readLevels(block, steps, cycles)
    return { levels: values ? call : null, otherLevel: Boolean(call) && !values }
}

function fits(notes: Note[], candidate: Note, skip: number, steps: number): boolean {
    if (candidate.start < 0 || candidate.length < 1 || candidate.start + candidate.length > steps) return false
    if (candidate.midi < 0 || candidate.midi > 127) return false
    return !notes.some((note, i) => i !== skip && overlap(note, candidate))
}

// How long a new note that starts here can be: up to the next note of its pitch, or to the end.
// Nothing where a note of that pitch already sounds.
export function roomAt(notes: Note[], start: number, midi: number, steps: number): number {
    const here = notes.filter((note) => note.midi === midi)
    if (start < 0 || start >= steps || here.some((note) => note.start <= start && start < note.start + note.length)) return 0
    return Math.min(steps, ...here.filter((note) => note.start > start).map((note) => note.start)) - start
}

// A note that says no level of its own takes the one of the notes that start with it. One
// that does, a note played on a keyboard, gives them its own: the step has one level.
export function addNote(notes: Note[], note: Note, steps: number): Note[] | null {
    const candidate = { ...note, length: Math.min(note.length, steps - note.start) }
    if (!fits(notes, candidate, -1, steps)) return null
    const level = fitLevel(candidate.level ?? levelAt(notes, candidate.start) ?? 1)
    return inOrder([...notes.map((other) => (other.start === candidate.start ? levelled(other, level) : other)), levelled(candidate, level)])
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

// A note that is moved to where others start takes their level.
export function moveNote(notes: Note[], ref: NoteRef, to: NoteRef, steps: number): Note[] | null {
    const there = levelAt(notes.filter((note) => !same(note, ref)), to.start)
    return replace(notes, ref, (note) => levelled({ ...note, start: to.start, midi: to.midi }, there ?? note.level ?? 1), steps)
}

// Several notes moved together, by as many steps each and to the pitch `to` gives each. Null
// when one of them would leave the pattern or lie over another note.
export function moveNotes(notes: Note[], refs: NoteRef[], by: number, to: (midi: number) => number, steps: number): Note[] | null {
    const moving = notes.filter((note) => refs.some((ref) => same(note, ref)))
    if (!moving.length) return null
    const staying = notes.filter((note) => !moving.includes(note))
    const moved = moving.map((note) => ({ ...note, start: note.start + by, midi: to(note.midi) }))
    let next = staying
    for (const note of moved) {
        if (!fits(next, note, -1, steps)) return null
        next = [...next, note]
    }
    return inOrder(next)
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
    if (!events.length) return { notes: [], cycles: 1, perCycle: emptySteps() }
    const onGrid = (value: number, perCycle: number) => Math.abs(value * perCycle - Math.round(value * perCycle)) < 1e-6
    const perCycle = (meterNow() === USUAL ? NOTE_RESOLUTIONS : noteSteps(meterNow())).find((candidate) => events.every((event) => onGrid(event.start, candidate) && onGrid(event.length, candidate)))
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
    const grid: TextEdit = { from: source.from, to: source.to, insert: formatNoteGrid(notes, steps, steps / cycles) }
    const length = lengthEdits(block, source.slow, cycles)
    const text = source.otherLevel ? null : levelText(notes, steps, cycles)
    const kept = source.levels
    if (kept) return [grid, ...length, text ? { from: kept.args[0].from, to: kept.args[0].to, insert: `"${text}"` } : removeCall(kept)]
    if (!text) return [grid, ...length]
    const call = `.${LEVEL}("${text}")`
    // The levels come after the length. Where the length is put in or taken out by this same
    // change, the two stand in one place and are one change.
    const end = block.calls[0].to
    if (!source.slow && cycles > 1) return [grid, { from: end, to: end, insert: `.slow(${cycles})${call}` }]
    if (source.slow && cycles === 1) return [grid, { from: source.slow.from, to: source.slow.to, insert: call }]
    const after = (source.slow ?? block.calls[0]).to
    return [grid, ...length, { from: after, to: after, insert: call }]
}
