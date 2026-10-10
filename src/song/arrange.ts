import { barsText, MAX_BARS, parseBars } from './bars'
import { addCall, removeCall, setString } from './edits'
import type { Arg, Call, PatternBlock, TextEdit } from './types'

export const DEFAULT_SONG = 16
export const ARRANGE = 'mask'

export type Arrangement = { call: Call; arg: Extract<Arg, { kind: 'string' }>; bars: boolean[] }

export function readArrangement(block: PatternBlock): Arrangement | null {
    for (let i = block.calls.length - 1; i > 0; i--) {
        const call = block.calls[i]
        const arg = call.args[0]
        if (call.name !== ARRANGE || call.args.length !== 1 || arg.kind !== 'string') continue
        const bars = parseBars(arg.value)
        if (bars) return { call, arg, bars }
    }
    return null
}

export const songLength = (blocks: PatternBlock[], fallback: number): number =>
    Math.max(0, ...blocks.map((block) => readArrangement(block)?.bars.length ?? 0)) || fallback

export function barsOf(block: PatternBlock, length: number): boolean[] {
    const written = readArrangement(block)?.bars
    return Array.from({ length }, (_, bar) => (written ? written[bar % written.length] : true))
}

export function paint(bars: boolean[], from: number, to: number, on: boolean): boolean[] {
    const low = Math.min(from, to)
    const high = Math.max(from, to)
    return bars.map((was, bar) => (bar >= low && bar <= high ? on : was))
}

export function arrangeEdit(code: string, block: PatternBlock, bars: boolean[]): TextEdit | null {
    const written = readArrangement(block)
    if (bars.every(Boolean)) return written ? removeCall(written.call) : null
    const text = barsText(bars)
    if (written) return written.arg.value === text ? null : setString(written.arg, text)
    return addCall(code, block, `.${ARRANGE}("${text}")`)
}

// The song has no length of its own. It ends with the last bar in which anything plays, so
// filling a bar past the end makes it longer, for every pattern, and emptying the last bars
// makes it shorter. Past the old end the other patterns rest until they are filled in too.
export function arrangeSong(code: string, blocks: PatternBlock[], id: string, bars: boolean[], length: number): { edits: TextEdit[]; length: number } {
    const span = Math.min(MAX_BARS, Math.max(length, bars.length))
    const lanes = blocks.map((block) => {
        const now = block.id === id ? bars : barsOf(block, length)
        return Array.from({ length: span }, (_, bar) => now[bar] ?? false)
    })
    const last = Math.max(...lanes.map((lane) => lane.lastIndexOf(true)))
    const next = last < 0 ? length : last + 1
    const edits = blocks.flatMap((block, at) => {
        const edit = arrangeEdit(code, block, lanes[at].slice(0, next))
        return edit ? [edit] : []
    })
    return { edits, length: next }
}

export type Clip = { from: number; length: number }

export function clips(bars: boolean[]): Clip[] {
    const found: Clip[] = []
    for (let bar = 0; bar < bars.length; bar++) {
        if (!bars[bar]) continue
        const last = found[found.length - 1]
        if (last && last.from + last.length === bar) last.length++
        else found.push({ from: bar, length: 1 })
    }
    return found
}
