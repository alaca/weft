import { ARRANGE } from './arrange'
import { MAX_BARS } from './bars'
import { setString } from './edits'
import type { Arg, Call, PatternBlock, TextEdit } from './types'

// A value that is set bar by bar over the song, in place of a knob that stays where it is put:
// .lpf("<400!8 900!4 2400!4>") is 400 for eight bars, 900 for four and 2400 for four. It is
// written like the bars a pattern plays in, a run of the same value as a count, and is one
// bar to a value because the brackets make Strudel take one of them each cycle.
//
// The values are kept as they are written, so that a curve that is only made longer or
// shorter comes out with the same numbers it went in with.
export type Curve = { call: Call; arg: Extract<Arg, { kind: 'string' }>; values: string[] }

const TOKEN = /^(-?(?:\d+\.?\d*|\.\d+))(?:!(\d+))?$/

export function parseCurve(text: string): string[] | null {
    const inner = /^\s*<([^<>]*)>\s*$/.exec(text)
    if (!inner || !inner[1].trim()) return null
    const values: string[] = []
    for (const token of inner[1].trim().split(/\s+/)) {
        const match = TOKEN.exec(token)
        const count = match?.[2] ? Number(match[2]) : 1
        if (!match || count < 1 || values.length + count > MAX_BARS) return null
        for (let i = 0; i < count; i++) values.push(match[1])
    }
    return values
}

export function curveText(values: string[]): string {
    const runs: string[] = []
    for (let from = 0; from < values.length; ) {
        let to = from
        while (to < values.length && values[to] === values[from]) to++
        runs.push(`${values[from]}${to - from > 1 ? `!${to - from}` : ''}`)
        from = to
    }
    return `<${runs.join(' ')}>`
}

// The bars a pattern plays in are written the same way and are not a curve.
export function readCurve(call: Call | undefined): Curve | null {
    const arg = call?.args[0]
    if (!call || call.name === ARRANGE || call.args.length !== 1 || !arg || arg.kind !== 'string') return null
    const values = parseCurve(arg.value)
    return values ? { call, arg, values } : null
}

export const curvesOf = (block: PatternBlock): Curve[] => block.calls.slice(1).flatMap((call) => readCurve(call) ?? [])

// The curve over a song of this many bars. One that is shorter goes round, as Strudel plays it.
export const curveOver = (values: string[], length: number): string[] => Array.from({ length }, (_, bar) => values[bar % values.length])

// A curve that was as long as the song follows it when the song is made longer or shorter, or
// has bars put into it: `change` is given the values and gives back the new ones. A list of
// numbers of another length was not drawn over this song, and is left alone.
export function followSong(blocks: PatternBlock[], length: number, change: (values: string[]) => string[]): TextEdit[] {
    return blocks.flatMap((block) =>
        curvesOf(block).flatMap((curve) => {
            if (curve.values.length !== length) return []
            const text = curveText(change(curve.values).slice(0, MAX_BARS))
            return text === curve.arg.value ? [] : [setString(curve.arg, text)]
        }),
    )
}

// Longer, a curve goes on at the value it ended on.
export const stretched = (values: string[], length: number): string[] => Array.from({ length }, (_, bar) => values[Math.min(bar, values.length - 1)])
