import { removeCall, setNumber } from './edits'
import type { Call, PatternBlock, TextEdit } from './types'

export type GridRow = { sound: string; steps: boolean[] }
export type Grid = { rows: GridRow[]; steps: number; cycles: number; perCycle: number }
export type GridSource = { grid: Grid; from: number; to: number; slow: Call | null }

const CELL = /^(~|[A-Za-z_]\w*(?::\d+)?)$/
const SOURCES = ['s', 'sound']
const MAX_STEPS = 64
const DEFAULT_STEPS = 16

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

export function formatGrid(rows: GridRow[]): string {
    if (!rows.length) return '"~"'
    const width = Math.max(...rows.map((row) => row.sound.length))
    const lines = rows.map((row) => {
        const cells = row.steps.map((on) => (on ? row.sound : '~').padEnd(width))
        const groups: string[] = []
        for (let i = 0; i < cells.length; i += 4) groups.push(cells.slice(i, i + 4).join(' '))
        return `  ${groups.join('   ').trimEnd()}`
    })
    return `\`\n${lines.join(' ,\n')}\n\``
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

const copy = (rows: GridRow[]): GridRow[] => rows.map((row) => ({ sound: row.sound, steps: [...row.steps] }))
const withHits = (rows: GridRow[]): GridRow[] => rows.filter((row) => row.steps.some(Boolean))

export function toggleStep(rows: GridRow[], sound: string, step: number, length: number): GridRow[] {
    const next = copy(rows)
    let row = next.find((candidate) => candidate.sound === sound)
    if (!row) {
        row = { sound, steps: Array<boolean>(length).fill(false) }
        next.push(row)
    }
    row.steps[step] = !row.steps[step]
    return withHits(next)
}

export function removeRow(rows: GridRow[], sound: string): GridRow[] {
    return copy(rows).filter((row) => row.sound !== sound)
}

export function resize(grid: Grid, cycles: number): GridRow[] {
    const total = grid.perCycle * cycles
    return withHits(grid.rows.map((row) => ({ sound: row.sound, steps: Array.from({ length: total }, (_, i) => row.steps[i % row.steps.length]) })))
}

export function resample(grid: Grid, perCycle: number): GridRow[] | null {
    if (perCycle === grid.perCycle) return copy(grid.rows)
    if (perCycle === grid.perCycle * 2) {
        return grid.rows.map((row) => ({ sound: row.sound, steps: row.steps.flatMap((on) => [on, false]) }))
    }
    if (perCycle * 2 === grid.perCycle) {
        if (grid.rows.some((row) => row.steps.some((on, i) => on && i % 2 === 1))) return null
        return grid.rows.map((row) => ({ sound: row.sound, steps: row.steps.filter((_, i) => i % 2 === 0) }))
    }
    return null
}

export function gridFromEvents(cycles: { start: number; value: unknown }[][]): GridRow[] | null {
    if (!cycles.length) return null
    const key = (events: { start: number; value: unknown }[]) =>
        events
            .map((event) => `${event.start.toFixed(6)}:${String(event.value)}`)
            .sort()
            .join('|')
    if (cycles.some((events) => key(events) !== key(cycles[0]))) return null
    for (const perCycle of [DEFAULT_STEPS, DEFAULT_STEPS * 2]) {
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

export function gridEdits(block: PatternBlock, source: GridSource, rows: GridRow[], cycles: number): TextEdit[] {
    return [{ from: source.from, to: source.to, insert: formatGrid(rows) }, ...lengthEdits(block, source.slow, cycles)]
}
