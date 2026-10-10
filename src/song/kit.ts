import { DEFAULT_STEPS, lengthEdits, MAX_STEPS, sourceText, type GridRow } from './grid'
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
        const cells = struct.value.trim().split(/\s+/)
        if (cells.some((cell) => cell !== 'x' && cell !== '~') || rows.some((row) => row.sound === sound.value)) return null
        rows.push({
            sound: sound.value,
            steps: cells.map((cell) => cell === 'x'),
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

export const isDrums = (block: PatternBlock): boolean => sourceText(block) !== null || readKit(block) !== null

export function structText(steps: boolean[]): string {
    const groups: string[] = []
    for (let i = 0; i < steps.length; i += 4) {
        groups.push(
            steps
                .slice(i, i + 4)
                .map((on) => (on ? 'x' : '~'))
                .join(' '),
        )
    }
    return groups.join('   ')
}

const rowText = (row: GridRow, width: number) => `s("${row.sound}")${' '.repeat(width - row.sound.length)}.struct("${structText(row.steps)}")`
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
        const text = structText(next.steps)
        if (arg.kind === 'string' && arg.value !== text) edits.push({ from: arg.from + 1, to: arg.to - 1, insert: text })
    }
    const added = rows.filter((row) => !kit.rows.some((old) => old.sound === row.sound))
    if (added.length) edits.push(rowInsertion(code, kit, added, width))
    return edits
}

export function convertEdits(block: PatternBlock, slow: Call | null, rows: GridRow[], cycles: number): TextEdit[] {
    const source = block.calls[0]
    return [{ from: source.nameFrom, to: source.to, insert: kitText(rows) }, ...lengthEdits(block, slow, cycles)]
}
