import { removeCall, setNumber } from './edits'
import type { Call, PatternBlock, TextEdit } from './types'

// `accents` says which of the hits are louder than the rest. A row that has none leaves it out.
export type GridRow = { sound: string; steps: boolean[]; accents?: boolean[] }
export type Grid = { rows: GridRow[]; steps: number; cycles: number; perCycle: number }
export type GridSource = { grid: Grid; from: number; to: number; slow: Call | null }

export const DEFAULT_STEPS = 16
// The numbers of steps to a bar a drum grid can be put on. Twelve and twenty-four are for music
// counted in threes: four beats of three, a shuffle, a 6/8 or a 12/8.
export const DRUM_RESOLUTIONS = [12, 16, 24, 32]
// Steps are written, and shown, in groups: threes where the bar is counted in threes, else fours.
export const groupOf = (steps: number): number => (steps % 3 === 0 ? 3 : 4)
// Four cycles of 32 steps is the longest and finest grid the controls offer.
export const MAX_STEPS = 128

const CELL = /^(~|[A-Za-z_]\w*(?::\d+)?)$/
const SOURCES = ['s', 'sound']

export function parseGrid(text: string): GridRow[] | null {
    const lines = text.split(',').map((line) => line.trim().split(/\s+/).filter(Boolean))
    const length = lines[0]?.length ?? 0
    if (!length || length % 4 !== 0 || length > MAX_STEPS) return null
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

const copy = (rows: GridRow[]): GridRow[] => rows.map((row) => ({ sound: row.sound, steps: [...row.steps], ...(row.accents ? { accents: [...row.accents] } : {}) }))
const mapped = (row: GridRow, each: (list: boolean[]) => boolean[]): GridRow => ({ sound: row.sound, steps: each(row.steps), ...(row.accents ? { accents: each(row.accents) } : {}) })

export function toggleStep(rows: GridRow[], sound: string, step: number, length: number): GridRow[] {
    const next = copy(rows)
    let row = next.find((candidate) => candidate.sound === sound)
    if (!row) {
        row = { sound, steps: Array<boolean>(length).fill(false) }
        next.push(row)
    }
    row.steps[step] = !row.steps[step]
    if (!row.steps[step] && row.accents) row.accents[step] = false
    return next
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
    const rows = grid.rows.map((row) => {
        const accents = row.accents?.map((loud, at) => loud && row.steps[at])
        return { sound: row.sound, steps: moved(row.steps), ...(accents ? { accents: moved(accents) } : {}) }
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
    for (const perCycle of [DEFAULT_STEPS, 12, DEFAULT_STEPS * 2, 24]) {
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
