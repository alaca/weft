import { groupOf, type GridRow } from './grid'
import { meterNow, sliceSteps, usualSteps } from './meter'
import type { Arg, Call, PatternBlock, TextEdit } from './types'

// A sample cut into equal parts that are played in any order, written the way Strudel writes it:
//
//   loop: s("my_break").splice(16, "0 1 2 3   4 5 6 7   8 9 10 11   12 13 14 15")
//
// The sample is cut into as many parts as the pattern has steps, so the parts in their own
// order are the sample as it was, over the length of the pattern. `splice` fits each part to
// its step, which is what makes a loop follow the tempo; `slice` plays it as fast as it was
// recorded. A pattern longer than a bar has its steps in brackets: "[0 1 ... 31]/2". Two parts
// on one step are written [0,4].
type Text = Extract<Arg, { kind: 'string' }>
type Count = Extract<Arg, { kind: 'number' }>
export type Slices = { sound: Text; call: Call; count: Count; text: Text; fit: boolean; parts: number; cycles: number; perCycle: number; cells: number[][] }

export const MOST_PARTS = 32
export const FIT = 'splice'
export const PLAIN = 'slice'

const SOUND = /^[A-Za-z_]\w*(?::\d+)?$/
const LONG = /^\[(.*)\]\/(\d+)$/s

function readCell(text: string, parts: number): number[] | null {
    if (text === '~') return []
    const found = /^\d+$/.test(text) ? [text] : /^\[\d+(,\d+)*\]$/.test(text) ? text.slice(1, -1).split(',') : null
    const list = found?.map(Number)
    return list && list.every((part) => part < parts) && new Set(list).size === list.length ? list : null
}

export function readSlices(block: PatternBlock): Slices | null {
    const [source, call] = block.calls
    const sound = source?.args.length === 1 ? source.args[0] : undefined
    if (!source || !call || !sound || sound.kind !== 'string' || (source.name !== 's' && source.name !== 'sound') || !SOUND.test(sound.value)) return null
    if (call.name !== FIT && call.name !== PLAIN) return null
    const [count, text] = call.args
    if (call.args.length !== 2 || count.kind !== 'number' || text.kind !== 'string') return null
    const long = LONG.exec(text.value.trim())
    const cycles = long ? Number(long[2]) : 1
    const cells = (long ? long[1] : text.value).trim().split(/\s+/).map((cell) => readCell(cell, count.value))
    const parts = count.value
    if (!Number.isInteger(parts) || parts !== cells.length || parts > MOST_PARTS || cycles < 1 || parts % cycles !== 0 || cells.some((cell) => !cell)) return null
    const perCycle = parts / cycles
    if (!sliceSteps(meterNow()).includes(perCycle)) return null
    return { sound, call, count, text, fit: call.name === FIT, parts, cycles, perCycle, cells: cells as number[][] }
}

// Each part as a row of a grid: where in the pattern it is played.
export const sliceRows = (cells: number[][]): GridRow[] => cells.map((_, part) => ({ sound: String(part + 1), steps: cells.map((cell) => cell.includes(part)) }))

export const cellsOf = (rows: GridRow[]): number[][] => (rows[0]?.steps ?? []).map((_, step) => rows.flatMap((row, part) => (row.steps[step] ? [part] : [])))

export function slicesText(cells: number[][], cycles: number): string {
    const written = cells.map((cell) => (cell.length === 0 ? '~' : cell.length === 1 ? String(cell[0]) : `[${cell.join(',')}]`))
    const groups: string[] = []
    const size = groupOf(written.length / cycles)
    for (let at = 0; at < written.length; at += size) groups.push(written.slice(at, at + size).join(' '))
    const text = groups.join('   ')
    return cycles > 1 ? `[${text}]/${cycles}` : text
}

export const inOrder = (parts: number): number[][] => Array.from({ length: parts }, (_, part) => [part])
export const backwards = (parts: number): number[][] => inOrder(parts).reverse()
export const empty = (parts: number): number[][] => Array.from({ length: parts }, () => [])

// The same parts on the same steps, in another order. `pick` chooses, as Math.random does.
export function shuffled(cells: number[][], pick: () => number = Math.random): number[][] {
    const next = cells.map((cell) => [...cell])
    for (let at = next.length - 1; at > 0; at--) {
        const other = Math.floor(pick() * (at + 1))
        ;[next[at], next[other]] = [next[other], next[at]]
    }
    return next
}

// Cut twice as fine over the same length, every part becomes two halves that follow each other,
// so what is heard stays what it was. Any other change of how the sample is cut gives parts that
// are other stretches of it, and they are put in their own order.
export function recut(slices: Slices, perCycle: number, cycles: number): number[][] {
    const parts = perCycle * cycles
    if (cycles === slices.cycles && perCycle === slices.perCycle * 2) return slices.cells.flatMap((cell) => [cell.map((part) => part * 2), cell.map((part) => part * 2 + 1)])
    return slices.cells.some((cell) => cell.length) ? inOrder(parts) : empty(parts)
}

export function sliceEdits(slices: Slices, cells: number[][], cycles: number): TextEdit[] {
    const text = slicesText(cells, cycles)
    return [
        ...(cells.length === slices.parts ? [] : [{ from: slices.count.from, to: slices.count.to, insert: String(cells.length) }]),
        ...(text === slices.text.value ? [] : [{ from: slices.text.from + 1, to: slices.text.to - 1, insert: text }]),
    ]
}

export const fitEdit = (slices: Slices, fit: boolean): TextEdit => ({ from: slices.call.nameFrom, to: slices.call.nameTo, insert: fit ? FIT : PLAIN })

// A new pattern for a sample that is to be sliced: a part for every sixteenth of a bar, in their own
// order, so that it is the sample as it was until the parts are moved.
export const slicesCode = (name: string, sound: string, mix: string[]): string => {
    const parts = Math.min(MOST_PARTS, usualSteps(meterNow()))
    return `${name}: s("${sound}").${FIT}(${parts}, "${slicesText(inOrder(parts), 1)}")${mix.map((call) => `\n  ${call}`).join('')}`
}
