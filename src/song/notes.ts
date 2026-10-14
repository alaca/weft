import { fitsBar, meterNow, noteSteps, USUAL, usualSteps } from './meter'
import { removeCall } from './edits'
import { groupOf, lengthEdits, LEVEL, stepKind } from './grid'
import { noteNameToMidi } from './pitch'
import type { Call, PatternBlock, TextEdit } from './types'
import { noteName } from './view'

// `level` is how loud the note is, as a hit of a drum grid has one: 1 where nothing says, which
// is how a note is written that was put in by hand. A note played on a keyboard has the level
// of how hard its key was pressed. `glide` says the note slides into its pitch from the note
// before it, as on an acid bass line.
export type Note = { start: number; length: number; midi: number; level?: number; glide?: boolean }
export type NoteRef = { start: number; midi: number }
export type NoteGrid = { notes: Note[]; steps: number; cycles: number; perCycle: number }
// `levels` is the call that holds a level for every step, when the code has one. `otherLevel`
// says the code sets the level some other way, which is then left as it is. `stacked` says the
// notes are written a line at a time, each line with levels of its own (see `rollText`).
// `glides` is the call that says how far each step slides, with `glideEnd` where the calls
// written with it end and `glideTime` how long a slide takes; `otherGlide` says the code bends
// the pitch some other way, which is then left as it is.
export type NoteSource = {
    grid: NoteGrid
    from: number
    to: number
    slow: Call | null
    levels: Call | null
    otherLevel: boolean
    stacked?: boolean
    glides?: Call | null
    glideEnd?: number
    glideTime?: number
    otherGlide?: boolean
}

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
    const { lines } = voiceLines(notes, steps)
    return `\`\n${lines.map((line) => `  ${line}`).join(' ,\n')}\n\``
}

// The notes as lines in which none lies over another, each written as its steps, with every
// step as wide as the widest of all lines so that the steps stand under each other.
function voiceLines(notes: Note[], steps: number): { voices: Note[][]; lines: string[] } {
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
        return groups.join('   ').trimEnd()
    })
    return { voices, lines }
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

// A glide is written as how far the pitch of each step starts from its own, in semitones, with
// how long it takes to get there, all after the notes and their levels:
//   note(`c2 ~  g2 ~`).penv("0 0 -7 0").pattack(0.08).prelease(600)
// That is the pitch envelope of every sound, held at the note's own pitch once it is there:
// the long release keeps it from falling back while the note fades out. A step with a chord on
// it cannot glide, as every note of the step would slide by the same.
export const GLIDE = 'penv'
export const GLIDE_TIME = 0.08
const GLIDE_TAIL = 600

// The note another slides from: the last to start before it, or, for the first, the last of the
// pattern, as the pattern goes round. Where several start together, the one nearest in pitch.
export function noteBefore(notes: Note[], note: Note): Note | null {
    const earlier = notes.filter((other) => other.start < note.start)
    const pool = earlier.length ? earlier : notes.filter((other) => other.start > note.start)
    if (!pool.length) return null
    const last = Math.max(...pool.map((other) => other.start))
    return pool.filter((other) => other.start === last).sort((a, b) => Math.abs(a.midi - note.midi) - Math.abs(b.midi - note.midi))[0]
}

// How far the note on a step slides, in semitones; null where it cannot: no note or several
// start there, or the one before it has its pitch.
export function glideFrom(notes: Note[], start: number): number | null {
    const there = notes.filter((note) => note.start === start)
    if (there.length !== 1) return null
    const from = noteBefore(notes, there[0])
    return from && from.midi !== there[0].midi ? there[0].midi - from.midi : null
}

const stepsText = (valueAt: (step: number) => string, steps: number, cycles: number): string => {
    const size = groupOf(steps)
    const groups: string[] = []
    for (let at = 0; at < steps; at += size) groups.push(Array.from({ length: Math.min(size, steps - at) }, (_, i) => valueAt(at + i)).join(' '))
    const text = groups.join('   ')
    return cycles > 1 ? `[${text}]/${cycles}` : text
}

export function glideText(notes: Note[], steps: number, cycles: number, time = GLIDE_TIME): string | null {
    const by = new Map<number, number>()
    for (const note of notes) {
        const far = note.glide ? glideFrom(notes, note.start) : null
        if (far !== null) by.set(note.start, far)
    }
    if (!by.size) return null
    return `.${GLIDE}("${stepsText((step) => String(by.get(step) ?? 0), steps, cycles)}").pattack(${time}).prelease(${GLIDE_TAIL})`
}

// The glides the code says, if they are the app's own: each step that slides does so by exactly
// as far as from the note before it.
function readGlides(block: PatternBlock, notes: Note[], steps: number, cycles: number): { notes: Note[]; glides: Call | null; glideEnd?: number; glideTime?: number; otherGlide: boolean } {
    const at = block.calls.findIndex((call) => call.name === GLIDE)
    const call = at > 0 ? block.calls[at] : null
    if (!call) return { notes, glides: null, otherGlide: false }
    const arg = call.args.length === 1 ? call.args[0] : undefined
    const long = arg?.kind === 'string' ? LONG.exec(arg.value.trim()) : null
    const values = arg?.kind === 'string' ? (long ? long[1] : arg.value).trim().split(/\s+/).map(Number) : []
    const other = { notes, glides: null, otherGlide: true }
    if (values.length !== steps || (long ? Number(long[2]) : 1) !== cycles || !values.every(Number.isFinite)) return other
    const sliding = new Set<number>()
    for (let step = 0; step < steps; step++) {
        if (!values[step]) continue
        if (glideFrom(notes, step) !== values[step]) return other
        sliding.add(step)
    }
    // Written with it, and so going with it: how long a slide takes, and the long release.
    let end = call.to
    let time: number | undefined
    const next = block.calls[at + 1]
    if (next?.name === 'pattack' && next.from === end && next.args[0]?.kind === 'number') {
        time = next.args[0].value
        end = next.to
        const tail = block.calls[at + 2]
        if (tail?.name === 'prelease' && tail.from === end) end = tail.to
    }
    return { notes: notes.map((note) => (sliding.has(note.start) ? { ...note, glide: true } : note)), glides: call, glideEnd: end, glideTime: time, otherGlide: false }
}

// The steps from one on given a glide or none: the note on each slides from the one before, or
// does not. A step that cannot glide is left as it is. Null when nothing changes.
export function setGlides(notes: Note[], from: number, on: boolean[]): Note[] | null {
    let changed = false
    const next = notes.map((note) => {
        const wanted = on[note.start - from]
        if (wanted === undefined || Boolean(note.glide) === wanted || (wanted && glideFrom(notes, note.start) === null)) return note
        changed = true
        const { glide: _, ...rest } = note
        return wanted ? { ...rest, glide: true } : rest
    })
    return changed ? next : null
}

// Whether the notes of a chord have levels that differ, which a level for every step cannot say.
export const levelsOfTheirOwn = (notes: Note[]): boolean => notes.some((note) => notes.some((other) => other.start === note.start && (other.level ?? 1) !== (note.level ?? 1)))

// A pattern's notes as code, with how many bars they last and how loud each is. While every
// note that starts on a step has one level, that is one line of notes for all of them with one
// level for every step. Where the notes of a chord differ, as when a pianist plays the top note
// louder, each line of notes is written with levels of its own and the lines are stacked:
//   stack(
//     note(`c3 _ ~ ~`).postgain("0.6 1 1 1"),
//     note(`e3 _ ~ ~`),
//   ).slow(2)
// Their levels stand inside, so they need no brackets for the bars.
export function rollText(notes: Note[], steps: number, cycles: number, glideTime = GLIDE_TIME): string {
    const slow = cycles > 1 ? `.slow(${cycles})` : ''
    if (!levelsOfTheirOwn(notes)) {
        const levels = levelText(notes, steps, cycles)
        return `note(${formatNoteGrid(notes, steps, steps / cycles)})${slow}${levels ? `.${LEVEL}("${levels}")` : ''}${glideText(notes, steps, cycles, glideTime) ?? ''}`
    }
    const { voices, lines } = voiceLines(notes, steps)
    const voiceLevels = (voice: Note[]) => levelText(voice, steps, 1)
    const rows = voices.map((voice, at) => {
        const levels = voiceLevels(voice)
        return `  note(\`${lines[at]}\`)${levels ? `.${LEVEL}("${levels}")` : ''},\n`
    })
    return `stack(\n${rows.join('')})${slow}`
}

// A run of steps given a level each, from one step on: every note that starts on one of them
// is that loud, or, when some notes are named, every one of those. Null when nothing changes.
export function setLevels(notes: Note[], from: number, levels: number[], only?: NoteRef[]): Note[] | null {
    let changed = false
    const next = notes.map((note) => {
        if (only && !only.some((ref) => same(note, ref))) return note
        const level = levels[note.start - from]
        if (level === undefined || fitLevel(level) === (note.level ?? 1)) return note
        changed = true
        return levelled(note, fitLevel(level))
    })
    return changed ? next : null
}

type Voice = { text: string; levels: string | null }

// The lines of a roll written as a stack, each a line of notes with or without its levels.
function stackedVoices(call: Call | undefined): Voice[] | null {
    if (!call || call.name !== 'stack' || !call.args.length) return null
    const voices: Voice[] = []
    for (const arg of call.args) {
        if (arg.kind !== 'chain') return null
        const [notes, levels, ...more] = arg.calls
        const text = notes?.name === 'note' && notes.args.length === 1 && notes.args[0].kind === 'string' ? notes.args[0].value : null
        const said = levels?.name === LEVEL && levels.args.length === 1 && levels.args[0].kind === 'string' ? levels.args[0].value : null
        if (text === null || more.length || (levels && said === null)) return null
        voices.push({ text, levels: said })
    }
    return voices
}

// What the pattern plays, as the text of its notes. Notes written a line at a time come as one
// text of all the lines, to be read and not to be written into.
export function noteText(block: PatternBlock): { text: string; from: number; to: number; stacked?: boolean } | null {
    const source = block.calls[0]
    const voices = stackedVoices(source)
    if (voices) return { text: voices.map((voice) => voice.text).join(','), from: source.from, to: source.to, stacked: true }
    const arg = source?.args[0]
    if (!source || source.name !== 'note' || source.args.length !== 1 || !arg || arg.kind !== 'string') return null
    return { text: arg.value, from: arg.from, to: arg.to }
}

function slowOf(block: PatternBlock): { slow: Call | null; cycles: number } | null {
    const next = block.calls[1]
    const slow = next?.name === 'slow' ? next : null
    const arg = slow?.args[0]
    if (slow && !(arg && arg.kind === 'number' && Number.isInteger(arg.value) && arg.value >= 1)) return null
    return { slow, cycles: arg && arg.kind === 'number' ? arg.value : 1 }
}

export function readNotes(block: PatternBlock): NoteSource | null {
    const voices = stackedVoices(block.calls[0])
    if (voices) return readStacked(block, voices)
    const text = noteText(block)
    const parsed = text ? parseNoteGrid(text.text) : null
    const length = slowOf(block)
    if (!text || !parsed || !length) return null
    const { slow, cycles } = length
    if (parsed.steps % cycles !== 0) return null
    const levels = readLevels(block, parsed.steps, cycles)
    const levelledNotes = levels.values ? parsed.notes.map((note) => levelled(note, fitLevel((levels.values as number[])[note.start]))) : parsed.notes
    const { notes, ...glides } = readGlides(block, levelledNotes, parsed.steps, cycles)
    return { grid: { notes, steps: parsed.steps, cycles, perCycle: parsed.steps / cycles }, from: text.from, to: text.to, slow, ...noteLevelsOf(block, parsed.steps, cycles), ...glides }
}

function readStacked(block: PatternBlock, voices: Voice[]): NoteSource | null {
    const length = slowOf(block)
    if (!length) return null
    const notes: Note[] = []
    let steps = 0
    for (const voice of voices) {
        const parsed = parseNoteGrid(voice.text)
        if (!parsed || (steps && parsed.steps !== steps)) return null
        steps = parsed.steps
        const values = voice.levels === null ? null : voice.levels.trim().split(/\s+/).map(Number)
        if (values && (values.length !== steps || !values.every((value) => Number.isFinite(value) && value >= 0))) return null
        notes.push(...parsed.notes.map((note) => (values ? levelled(note, fitLevel(values[note.start])) : note)))
    }
    const { slow, cycles } = length
    if (!steps || steps % cycles !== 0) return null
    const source = block.calls[0]
    // A level written for the whole pattern after the lines would sound in place of theirs.
    const other = block.calls.some((call) => call.name === LEVEL)
    return { grid: { notes: inOrder(notes), steps, cycles, perCycle: steps / cycles }, from: source.from, to: source.to, slow, levels: null, otherLevel: other, stacked: true, otherGlide: block.calls.some((call) => call.name === GLIDE) }
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
// that does, a note played on a keyboard, keeps its own, so a chord keeps how hard each of its
// keys was pressed.
export function addNote(notes: Note[], note: Note, steps: number): Note[] | null {
    const candidate = { ...note, length: Math.min(note.length, steps - note.start) }
    if (!fits(notes, candidate, -1, steps)) return null
    const level = fitLevel(candidate.level ?? levelAt(notes, candidate.start) ?? 1)
    return inOrder([...notes, levelled(candidate, level)])
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
    // Notes with levels of their own are written as a whole, and so is a pattern that had such
    // notes and has them no more. Where the code says the level some other way, there are none.
    // So are notes that glide, and a pattern whose notes glided.
    const gliding = !source.otherGlide && notes.some((note) => note.glide)
    if (source.stacked || (!source.otherLevel && levelsOfTheirOwn(notes)) || source.glides || gliding) {
        const first = block.calls[0]
        let to = (source.slow ?? first).to
        const apart: TextEdit[] = []
        const kept = source.levels
        if (kept && kept.from === to) to = kept.to
        else if (kept) apart.push(removeCall(kept))
        const glides = source.glides
        if (glides && glides.from === to) to = source.glideEnd ?? glides.to
        else if (glides) apart.push({ from: glides.from, to: source.glideEnd ?? glides.to, insert: '' })
        const plain = source.otherLevel ? notes.map((note) => levelled(note, 1)) : notes
        return [{ from: first.from, to, insert: rollText(plain, steps, cycles, source.glideTime) }, ...apart]
    }
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
