import { removeCall, setNumber } from './edits'
import { beatSteps, drumSteps, fitsBar, meterNow, USUAL, usualSteps } from './meter'
import type { Call, PatternBlock, TextEdit } from './types'

// `accents` says which of the hits are louder than the rest. A row that has none leaves it out.
// A step can also have more of its own, each left out by a row that has none of it:
// `repeats`, how many times its hit sounds within the step; `chances`, how likely the hit is to
// sound, from 0 to 1; and `lanes`, a value for every step of something that is otherwise one
// knob for the whole row, under the name of its call.
export type GridRow = { sound: string; steps: boolean[]; accents?: boolean[]; repeats?: number[]; chances?: number[]; lanes?: Record<string, number[]> }
export type Grid = { rows: GridRow[]; steps: number; cycles: number; perCycle: number }
export type GridSource = { grid: Grid; from: number; to: number; slow: Call | null }

export const DEFAULT_STEPS = 16
// The numbers of steps to a bar a drum grid can be put on. Twelve and twenty-four are for music
// counted in threes: four beats of three, a shuffle, a 6/8 or a 12/8.
export const DRUM_RESOLUTIONS = [12, 16, 24, 32]
// Steps are written, and shown, in groups: threes where the bar is counted in threes, else fours.
export const groupOf = (steps: number): number => {
    // In another meter a group is a beat of the bar in sixteenths, where the steps come out even on it.
    const beat = beatSteps(usualSteps(meterNow()))
    if (beat && steps % beat === 0) return beat
    return steps % 3 === 0 ? 3 : 4
}
// Four cycles of 32 steps is the longest and finest grid the controls offer.
export const MAX_STEPS = 128

const CELL = /^(~|[A-Za-z_]\w*(?::\d+)?)$/
const SOURCES = ['s', 'sound']

export function parseGrid(text: string): GridRow[] | null {
    const lines = text.split(',').map((line) => line.trim().split(/\s+/).filter(Boolean))
    const length = lines[0]?.length ?? 0
    if (!length || !fitsBar(length) || length > MAX_STEPS) return null
    const rows: GridRow[] = []
    for (const cells of lines) {
        if (cells.length !== length || cells.some((cell) => !CELL.test(cell))) return null
        const sounds = [...new Set(cells.filter((cell) => cell !== '~'))]
        if (sounds.length !== 1) return null
        rows.push({ sound: sounds[0], steps: cells.map((cell) => cell !== '~') })
    }
    return rows
}

export function sourceText(block: PatternBlock): { text: string; from: number; to: number } | null {
    const source = block.calls[0]
    const arg = source?.args[0]
    if (!source || !SOURCES.includes(source.name) || source.args.length !== 1 || !arg || arg.kind !== 'string') return null
    return { text: arg.value, from: arg.from, to: arg.to }
}

export function readGrid(block: PatternBlock): GridSource | null {
    const text = sourceText(block)
    const rows = text ? parseGrid(text.text) : null
    if (!text || !rows) return null
    const next = block.calls[1]
    const slow = next?.name === 'slow' ? next : null
    const arg = slow?.args[0]
    if (slow && !(arg && arg.kind === 'number' && Number.isInteger(arg.value) && arg.value >= 1)) return null
    const cycles = arg && arg.kind === 'number' ? arg.value : 1
    const steps = rows[0].steps.length
    if (steps % cycles !== 0) return null
    return { grid: { rows, steps, cycles, perCycle: steps / cycles }, from: text.from, to: text.to, slow }
}

// Every list of a row put through the same change, step for step.
const mapped = (row: GridRow, each: <T>(list: T[]) => T[]): GridRow => ({
    sound: row.sound,
    steps: each(row.steps),
    ...(row.accents ? { accents: each(row.accents) } : {}),
    ...(row.repeats ? { repeats: each(row.repeats) } : {}),
    ...(row.chances ? { chances: each(row.chances) } : {}),
    ...(row.lanes ? { lanes: Object.fromEntries(Object.entries(row.lanes).map(([fn, values]) => [fn, each(values)])) } : {}),
})
const copy = (rows: GridRow[]): GridRow[] => rows.map((row) => mapped(row, (list) => [...list]))

// A step that is no hit any more is an ordinary step again: not louder, sounding once, always.
function clear(row: GridRow, step: number) {
    if (row.accents) row.accents[step] = false
    if (row.repeats) row.repeats[step] = 1
    if (row.chances) row.chances[step] = 1
}

export function toggleStep(rows: GridRow[], sound: string, step: number, length: number): GridRow[] {
    const next = copy(rows)
    let row = next.find((candidate) => candidate.sound === sound)
    if (!row) {
        row = { sound, steps: Array<boolean>(length).fill(false) }
        next.push(row)
    }
    row.steps[step] = !row.steps[step]
    if (!row.steps[step]) clear(row, step)
    return next
}

// Every step from one to another put in, or taken out, as a drag along a row leaves them.
// Null when they already are as asked.
export function paintSteps(rows: GridRow[], sound: string, from: number, to: number, on: boolean, length: number): GridRow[] | null {
    const next = copy(rows)
    let row = next.find((candidate) => candidate.sound === sound)
    if (!row) {
        row = { sound, steps: Array<boolean>(length).fill(false) }
        next.push(row)
    }
    let changed = false
    for (let step = Math.max(0, Math.min(from, to)); step <= Math.min(length - 1, Math.max(from, to)); step++) {
        if (row.steps[step] === on) continue
        row.steps[step] = on
        if (!on) clear(row, step)
        changed = true
    }
    return changed ? next : null
}

// A louder hit, or an ordinary one again. On an empty step it puts a louder hit in.
export function toggleAccent(rows: GridRow[], sound: string, step: number, length: number): GridRow[] {
    const next = copy(rows)
    let row = next.find((candidate) => candidate.sound === sound)
    if (!row) {
        row = { sound, steps: Array<boolean>(length).fill(false) }
        next.push(row)
    }
    const accents = row.accents ?? row.steps.map(() => false)
    accents[step] = row.steps[step] ? !accents[step] : true
    row.steps[step] = true
    row.accents = accents
    // Where every step has a level of its own, louder is one of those levels.
    const levels = row.lanes?.[LEVEL]
    if (levels) levels[step] = accents[step] ? LOUDER : 1
    return next
}

// Louder hits are written as a level for every step, and so is a level drawn step by step.
export const LEVEL = 'postgain'
export const LOUDER = 1.5
export const MOST_REPEATS = 4

// What a step can have of its own. `fn` is the call a value for every step is written with;
// chance and repeats are written into the steps themselves.
export type StepWhat = 'level' | 'chance' | 'repeats' | 'pan' | 'speed' | 'lpf' | 'delay'
export type StepKind = { what: StepWhat; label: string; fn?: string; min: number; max: number; usual: number; log?: boolean; about: string }
export const STEP_KINDS: StepKind[] = [
    { what: 'level', label: 'Level', fn: LEVEL, min: 0, max: 1.5, usual: 1, about: 'How loud each hit is' },
    { what: 'chance', label: 'Chance', min: 0, max: 1, usual: 1, about: 'How likely each hit is to sound, every time round' },
    { what: 'repeats', label: 'Repeats', min: 1, max: MOST_REPEATS, usual: 1, about: 'How many times each hit sounds within its step: a roll' },
    { what: 'pan', label: 'Pan', fn: 'pan', min: 0, max: 1, usual: 0.5, about: 'Where each hit sits, left to right' },
    { what: 'speed', label: 'Pitch', fn: 'speed', min: 0.5, max: 2, usual: 1, about: 'How fast, and so how high, each hit is played' },
    { what: 'lpf', label: 'Cutoff', fn: 'lpf', min: 100, max: 8000, usual: 8000, log: true, about: 'How bright each hit is' },
    { what: 'delay', label: 'Echo', fn: 'delay', min: 0, max: 1, usual: 0, about: 'How much of each hit is sent to the echo' },
]
export const stepKind = (what: StepWhat): StepKind => STEP_KINDS.find((kind) => kind.what === what) as StepKind

// The value every step of a row has for one of those things. `base` is what a step has where
// nothing was written step by step yet: what the row's knob stands on.
export function stepValues(row: GridRow, what: StepWhat, base?: number): number[] {
    const kind = stepKind(what)
    if (what === 'chance') return row.chances ? [...row.chances] : row.steps.map(() => 1)
    if (what === 'repeats') return row.repeats ? [...row.repeats] : row.steps.map(() => 1)
    const written = row.lanes?.[kind.fn as string]
    if (written) return [...written]
    if (what === 'level') return row.steps.map((_, at) => (row.accents?.[at] ? LOUDER : 1))
    return row.steps.map(() => base ?? kind.usual)
}

const fitted = (kind: StepKind, value: number): number => {
    const within = Math.min(kind.max, Math.max(kind.min, value))
    if (kind.what === 'repeats') return Math.round(within)
    if (kind.what === 'chance') return Math.round(within * 20) / 20
    const span = kind.max - kind.min
    const digits = span >= 100 ? 0 : 2
    return Number(within.toFixed(digits))
}

// A run of steps of one row given values of their own, from one step on. Only a hit can have
// one, so the other steps of the run are passed over. Null when nothing changes.
export function setSteps(rows: GridRow[], sound: string, what: StepWhat, from: number, values: number[], base?: number): GridRow[] | null {
    const next = copy(rows)
    const row = next.find((candidate) => candidate.sound === sound)
    if (!row) return null
    const kind = stepKind(what)
    const all = stepValues(row, what, base)
    let changed = false
    values.forEach((value, at) => {
        const step = from + at
        if (step < 0 || step >= row.steps.length || !row.steps[step]) return
        const fit = fitted(kind, value)
        if (all[step] === fit) return
        all[step] = fit
        changed = true
    })
    if (!changed) return null
    if (what === 'chance') row.chances = all
    else if (what === 'repeats') row.repeats = all
    else row.lanes = { ...row.lanes, [kind.fn as string]: all }
    if (what === 'level') row.accents = all.map((level, at) => level > 1 && row.steps[at])
    return next
}

// Every step of a row as it was before anything was written step by step for one of those
// things. Null when there was nothing.
export function clearSteps(rows: GridRow[], sound: string, what: StepWhat): GridRow[] | null {
    const next = copy(rows)
    const row = next.find((candidate) => candidate.sound === sound)
    if (!row) return null
    const kind = stepKind(what)
    if (what === 'chance') {
        if (!row.chances?.some((chance) => chance < 1)) return null
        delete row.chances
    } else if (what === 'repeats') {
        if (!row.repeats?.some((count) => count > 1)) return null
        delete row.repeats
    } else {
        const fn = kind.fn as string
        if (!row.lanes?.[fn] && !(what === 'level' && row.accents?.some(Boolean))) return null
        const { [fn]: _, ...rest } = row.lanes ?? {}
        if (Object.keys(rest).length) row.lanes = rest
        else delete row.lanes
        if (what === 'level') delete row.accents
    }
    return next
}

export function removeRow(rows: GridRow[], sound: string): GridRow[] {
    return copy(rows).filter((row) => row.sound !== sound)
}

export function resize(grid: Grid, cycles: number): GridRow[] {
    const total = grid.perCycle * cycles
    return grid.rows.map((row) => mapped(row, (list) => Array.from({ length: total }, (_, i) => list[i % list.length])))
}

// A grid on another number of steps to the bar. Every hit keeps its place in the bar, so when
// one would fall between two of the new steps the grid cannot be put on them, and nothing is
// given back.
export function resample(grid: Grid, perCycle: number): GridRow[] | null {
    if (perCycle === grid.perCycle) return copy(grid.rows)
    const total = (grid.steps / grid.perCycle) * perCycle
    let fits = true
    const moved = (list: boolean[]) => {
        const next = Array<boolean>(total).fill(false)
        list.forEach((on, at) => {
            if (!on) return
            const to = (at * perCycle) / grid.perCycle
            if (Number.isInteger(to)) next[to] = true
            else fits = false
        })
        return next
    }
    // What a hit has of its own goes with the hit. A value for every step is read off the step
    // that stood at the same place in the bar.
    const along = <T>(list: T[], usual: T): T[] => {
        const next = Array<T>(total).fill(usual)
        list.forEach((value, at) => {
            const to = (at * perCycle) / grid.perCycle
            if (grid.rows.length && Number.isInteger(to)) next[to] = value
        })
        return next
    }
    const sampled = (list: number[]): number[] => Array.from({ length: total }, (_, at) => list[Math.min(list.length - 1, Math.floor((at * grid.perCycle) / perCycle))])
    const rows = grid.rows.map((row): GridRow => {
        const accents = row.accents?.map((loud, at) => loud && row.steps[at])
        return {
            sound: row.sound,
            steps: moved(row.steps),
            ...(accents ? { accents: moved(accents) } : {}),
            ...(row.repeats ? { repeats: along(row.repeats, 1) } : {}),
            ...(row.chances ? { chances: along(row.chances, 1) } : {}),
            ...(row.lanes ? { lanes: Object.fromEntries(Object.entries(row.lanes).map(([fn, values]) => [fn, sampled(values)])) } : {}),
        }
    })
    return fits ? rows : null
}

export function gridFromEvents(cycles: { start: number; value: unknown }[][]): GridRow[] | null {
    if (!cycles.length) return null
    const key = (events: { start: number; value: unknown }[]) =>
        events
            .map((event) => `${event.start.toFixed(6)}:${String(event.value)}`)
            .sort()
            .join('|')
    if (cycles.some((events) => key(events) !== key(cycles[0]))) return null
    // The steps a bar of this song usually has are tried first, then the others it can have.
    const usual = usualSteps(meterNow())
    for (const perCycle of meterNow() === USUAL ? [DEFAULT_STEPS, 12, DEFAULT_STEPS * 2, 24] : [usual, ...drumSteps(meterNow()).filter((steps) => steps !== usual)]) {
        const rows: GridRow[] = []
        let fits = true
        for (const event of cycles[0]) {
            const at = event.start * perCycle
            if (typeof event.value !== 'string' || event.value === '~' || !CELL.test(event.value) || Math.abs(at - Math.round(at)) > 1e-6) {
                fits = false
                break
            }
            let row = rows.find((candidate) => candidate.sound === event.value)
            if (!row) {
                row = { sound: event.value, steps: Array<boolean>(perCycle).fill(false) }
                rows.push(row)
            }
            row.steps[Math.round(at)] = true
        }
        if (fits) return rows
    }
    return null
}

export function lengthEdits(block: PatternBlock, slow: Call | null, cycles: number): TextEdit[] {
    const arg = slow?.args[0]
    if (slow && cycles === 1) return [removeCall(slow)]
    if (slow && arg && arg.kind === 'number') return arg.value === cycles ? [] : [setNumber(arg, String(cycles))]
    if (cycles > 1) {
        const end = block.calls[0].to
        return [{ from: end, to: end, insert: `.slow(${cycles})` }]
    }
    return []
}
