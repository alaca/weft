import { barsText, parseBars } from './bars'
import { addCall, removeCall, setString } from './edits'
import type { Arg, Call, PatternBlock, TextEdit } from './types'

export const SONG_LENGTHS = [8, 16, 32, 64]
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

export function resizeEdits(code: string, blocks: PatternBlock[], length: number): TextEdit[] {
    return blocks.flatMap((block) => {
        if (!readArrangement(block)) return []
        const edit = arrangeEdit(code, block, barsOf(block, length))
        return edit ? [edit] : []
    })
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
