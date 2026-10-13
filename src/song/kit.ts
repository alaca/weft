import { controlText, findDef, mixText } from '../controls/catalog'
import { DEFAULT_STEPS, groupOf, lengthEdits, LEVEL, LOUDER, MAX_STEPS, MOST_REPEATS, sourceText, STEP_KINDS, type GridRow } from './grid'
import { readSlices } from './slices'
import type { Arg, Call, PatternBlock, TextEdit } from './types'

// A drum kit is written with one line for each sound, so that each sound can have its own
// controls after its line and the controls after the closing bracket are for the whole kit:
//
//   drums: stack(
//     s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~"),
//     s("hh").struct("~ ~ x ~   ~ ~ x ~   ~ ~ x ~   ~ ~ x ~").hpf(slider(4000, 20, 8000)),
//   )
//     .bank("RolandTR909")
export type KitRow = GridRow & { block: PatternBlock; muted: boolean }
export type Kit = { rows: KitRow[]; steps: number; cycles: number; perCycle: number; slow: Call | null; stack: Call }

const SOURCES = ['s', 'sound']
const SOUND = /^[A-Za-z_]\w*(?::\d+)?$/
const INDENT = '  '

// Louder hits are written as a level for every step, after the steps themselves:
//   s("hh").struct("x x x x").postgain("1 1.5 1 1")
// The call is only there when a row has a louder hit. Other things a step can have a value of
// its own for are written the same way, each with its own call: .pan("0.5 0.2 0.5 0.8").
// How often a hit sounds within its step and how likely it is to sound are written into the
// steps, the way Strudel writes them: x*3 sounds three times, x? every other time, x?0.25
// three times in four.
export const ACCENT = LEVEL

// The calls that can hold a value for every step, by the name the code may call them.
const LANES = STEP_KINDS.flatMap((kind) => (kind.fn && kind.fn !== LEVEL ? [kind.fn] : []))
const laneOf = (call: Call): string | null => {
    const fn = findDef(call.name)?.fn ?? call.name
    return LANES.includes(fn) ? fn : null
}

const STEP = /^x(?:\*([2-9]))?(?:\?(\d*\.?\d+)?)?$/
type Cell = { on: boolean; repeats: number; chance: number }
function readCell(text: string): Cell | null {
    if (text === '~') return { on: false, repeats: 1, chance: 1 }
    const found = STEP.exec(text)
    if (!found) return null
    const repeats = found[1] ? Number(found[1]) : 1
    const left = text.includes('?') ? (found[2] === undefined ? 0.5 : Number(found[2])) : 0
    if (repeats > MOST_REPEATS || !(left >= 0 && left <= 1)) return null
    return { on: true, repeats, chance: Math.round((1 - left) * 100) / 100 }
}

// The numbers of a call that holds one for every step, when that is what it holds.
const numbersOf = (call: Call | undefined, count: number): number[] | null => {
    const arg = call?.args.length === 1 ? call.args[0] : undefined
    if (!arg || arg.kind !== 'string') return null
    const values = arg.value.trim().split(/\s+/).map(Number)
    return values.length === count && values.every(Number.isFinite) ? values : null
}

// Strudel's own way to silence one pattern inside a stack.
export const MUTE = 'hush'

export const rowTarget = (id: string, sound: string) => `${id}/${sound}`

const stringOf = (call: Call | undefined, names: string[]): Extract<Arg, { kind: 'string' }> | null => {
    const arg = call?.args[0]
    return call && names.includes(call.name) && call.args.length === 1 && arg?.kind === 'string' ? arg : null
}

export function readKit(block: PatternBlock): Kit | null {
    const stack = block.calls[0]
    if (!stack || stack.name !== 'stack') return null
    const rows: KitRow[] = []
    for (const arg of stack.args) {
        if (arg.kind !== 'chain') return null
        const sound = stringOf(arg.calls[0], SOURCES)
        const struct = stringOf(arg.calls[1], ['struct'])
        if (!sound || !struct || !SOUND.test(sound.value)) return null
        const cells = struct.value.trim().split(/\s+/).map(readCell)
        if (cells.some((cell) => !cell) || rows.some((row) => row.sound === sound.value)) return null
        const read = cells as Cell[]
        const levels = numbersOf(arg.calls.find((call) => call.name === ACCENT), read.length)
        const accents = levels ? levels.map((level, at) => level > 1 && read[at].on) : null
        // Levels that are only ordinary and louder are the louder hits and nothing more.
        const drawn = levels?.some((level, at) => read[at].on && level !== 1 && level !== LOUDER) ? levels : null
        const lanes: Record<string, number[]> = drawn ? { [LEVEL]: drawn } : {}
        for (const call of arg.calls.slice(2)) {
            const fn = laneOf(call)
            const values = fn && !lanes[fn] ? numbersOf(call, read.length) : null
            if (fn && values) lanes[fn] = values
        }
        rows.push({
            sound: sound.value,
            steps: read.map((cell) => cell.on),
            ...(accents?.some(Boolean) ? { accents } : {}),
            ...(read.some((cell) => cell.repeats > 1) ? { repeats: read.map((cell) => cell.repeats) } : {}),
            ...(read.some((cell) => cell.chance < 1) ? { chances: read.map((cell) => cell.chance) } : {}),
            ...(Object.keys(lanes).length ? { lanes } : {}),
            muted: arg.calls.some((call) => call.name === MUTE),
            block: { ...block, id: rowTarget(block.id, sound.value), from: arg.from, to: arg.to, calls: arg.calls, soundName: sound.value, inline: true },
        })
    }
    const next = block.calls[1]
    const slow = next?.name === 'slow' ? next : null
    const count = slow?.args[0]
    if (slow && !(count && count.kind === 'number' && Number.isInteger(count.value) && count.value >= 1)) return null
    const cycles = count && count.kind === 'number' ? count.value : 1
    const steps = rows[0]?.steps.length ?? DEFAULT_STEPS * cycles
    if (rows.some((row) => row.steps.length !== steps) || steps % 4 !== 0 || steps > MAX_STEPS || steps % cycles !== 0) return null
    return { rows, steps, cycles, perCycle: steps / cycles, slow, stack }
}

// A sample that is cut into parts starts with the name of a sound as a drum pattern does, and is
// not one.
export const isDrums = (block: PatternBlock): boolean => (sourceText(block) !== null && readSlices(block) === null) || readKit(block) !== null

export function structText(steps: boolean[]): string {
    const groups: string[] = []
    const size = groupOf(steps.length)
    for (let i = 0; i < steps.length; i += size) {
        groups.push(
            steps
                .slice(i, i + size)
                .map((on) => (on ? 'x' : '~'))
                .join(' '),
        )
    }
    return groups.join('   ')
}

const grouped = (cells: string[]): string => {
    const groups: string[] = []
    const size = groupOf(cells.length)
    for (let i = 0; i < cells.length; i += size) groups.push(cells.slice(i, i + size).join(' '))
    return groups.join('   ')
}

const left = (chance: number): string => {
    const share = Math.round((1 - chance) * 100) / 100
    return share === 0.5 ? '?' : `?${share}`
}

// The steps of a row as they are written, with what each hit has of its own.
export function stepsText(row: GridRow): string {
    return grouped(
        row.steps.map((on, at) => {
            if (!on) return '~'
            const repeats = row.repeats?.[at] ?? 1
            const chance = row.chances?.[at] ?? 1
            return `x${repeats > 1 ? `*${repeats}` : ''}${chance < 1 ? left(chance) : ''}`
        }),
    )
}

// The level of every step, in the same groups as the steps. Null when no hit is louder and none
// has a level of its own.
export function accentText(row: GridRow): string | null {
    const levels = row.lanes?.[LEVEL]
    if (levels?.some((level, at) => row.steps[at] && level !== 1)) return grouped(levels.map((level, at) => (row.steps[at] ? String(level) : '1')))
    if (!row.accents?.some((loud, at) => loud && row.steps[at])) return null
    return grouped(row.steps.map((on, at) => (on && row.accents?.[at] ? String(LOUDER) : '1')))
}

// The value of every step for one of the other things a step can have its own of.
const laneText = (values: number[]): string => grouped(values.map(String))
const lanesOf = (row: GridRow): [string, number[]][] => Object.entries(row.lanes ?? {}).filter(([fn]) => fn !== LEVEL)

const accentCall = (row: GridRow) => {
    const text = accentText(row)
    return text ? `.${ACCENT}("${text}")` : ''
}

// A new sound comes with how loud it is and where it sits written after it.
const rowText = (row: GridRow, width: number) => `s("${row.sound}")${' '.repeat(width - row.sound.length)}.struct("${stepsText(row)}")${accentCall(row)}${mixText().join('')}`
const widthOf = (rows: GridRow[]) => Math.max(0, ...rows.map((row) => row.sound.length))

export function kitText(rows: GridRow[]): string {
    const width = widthOf(rows)
    return `stack(\n${rows.map((row) => `${INDENT}${rowText(row, width)},\n`).join('')})`
}

function rowRemoval(code: string, kit: Kit, row: KitRow): TextEdit {
    const lineStart = code.lastIndexOf('\n', row.block.from - 1) + 1
    const from = code.slice(lineStart, row.block.from).trim() === '' ? lineStart : row.block.from
    const after = /^\s*,[ \t]*\n?/.exec(code.slice(row.block.to))
    if (after) return { from, to: row.block.to + after[0].length, insert: '' }
    const inside = code.indexOf('(', kit.stack.nameTo) + 1
    const before = /,\s*$/.exec(code.slice(inside, row.block.from))
    return { from: before ? inside + before.index : from, to: row.block.to, insert: '' }
}

function rowInsertion(code: string, kit: Kit, added: GridRow[], width: number): TextEdit {
    const last = kit.rows[kit.rows.length - 1]
    const close = kit.stack.to - 1
    const lineStart = last ? code.lastIndexOf('\n', last.block.from - 1) + 1 : 0
    const indent = last && code.slice(lineStart, last.block.from).trim() === '' ? code.slice(lineStart, last.block.from) : INDENT
    const lines = added.map((row) => `\n${indent}${rowText(row, width)},`).join('')
    const comma = last ? /^\s*,/.exec(code.slice(last.block.to)) : null
    const at = last ? last.block.to + (comma ? comma[0].length : 0) : code.indexOf('(', kit.stack.nameTo) + 1
    const closing = code.slice(at, close).includes('\n') ? '' : '\n'
    return { from: at, to: at, insert: `${last && !comma ? ',' : ''}${lines}${closing}` }
}

export function kitEdits(code: string, kit: Kit, rows: GridRow[]): TextEdit[] {
    const width = widthOf(rows)
    const edits: TextEdit[] = []
    for (const old of kit.rows) {
        const next = rows.find((row) => row.sound === old.sound)
        if (!next) {
            edits.push(rowRemoval(code, kit, old))
            continue
        }
        const [sound, struct] = old.block.calls
        const gap = `${' '.repeat(width - old.sound.length)}.`
        if (code.slice(sound.to, struct.nameFrom) !== gap) edits.push({ from: sound.to, to: struct.nameFrom, insert: gap })
        const arg = struct.args[0]
        const text = stepsText(next)
        if (arg.kind === 'string' && arg.value !== text) edits.push({ from: arg.from + 1, to: arg.to - 1, insert: text })
        const written = old.block.calls.find((call) => call.name === ACCENT)
        const levels = stringOf(written, [ACCENT])
        const wanted = accentText(next)
        // What is put in straight after the steps is gathered, so that it goes in as one edit.
        let after = ''
        if (written && !wanted) edits.push({ from: written.from, to: written.to, insert: '' })
        else if (levels && wanted && levels.value !== wanted) edits.push({ from: levels.from + 1, to: levels.to - 1, insert: wanted })
        else if (!written && wanted) after += `.${ACCENT}("${wanted}")`
        // A value for every step takes the place of the knob the row had for it, and a knob
        // comes back, standing where the first hit stood, when the steps have no values any more.
        const count = old.steps.length
        for (const [fn, values] of lanesOf(next)) {
            const call = old.block.calls.slice(2).find((each) => laneOf(each) === fn)
            const wide = laneText(values)
            const was = call?.args.length === 1 ? call.args[0] : undefined
            if (!call) after += `.${fn}("${wide}")`
            else if (was?.kind === 'string' && numbersOf(call, count)) {
                if (was.value !== wide) edits.push({ from: was.from + 1, to: was.to - 1, insert: wide })
            } else edits.push({ from: call.from, to: call.to, insert: `.${fn}("${wide}")` })
        }
        for (const [fn, values] of lanesOf(old)) {
            if (next.lanes?.[fn]) continue
            const call = old.block.calls.slice(2).find((each) => laneOf(each) === fn && numbersOf(each, count))
            const def = findDef(fn)
            const stood = values[old.steps.indexOf(true)] ?? values[0]
            if (call && def) edits.push({ from: call.from, to: call.to, insert: controlText(def, stood) })
            else if (call) edits.push({ from: call.from, to: call.to, insert: '' })
        }
        if (after) edits.push({ from: struct.to, to: struct.to, insert: after })
    }
    const added = rows.filter((row) => !kit.rows.some((old) => old.sound === row.sound))
    if (added.length) edits.push(rowInsertion(code, kit, added, width))
    return edits
}

export function convertEdits(block: PatternBlock, slow: Call | null, rows: GridRow[], cycles: number): TextEdit[] {
    const source = block.calls[0]
    return [{ from: source.nameFrom, to: source.to, insert: kitText(rows) }, ...lengthEdits(block, slow, cycles)]
}
