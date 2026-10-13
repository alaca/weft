import { ARRANGE } from './arrange'
import { readLaid } from './audio'
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

// A count is written as Strudel reads one, with no nought in front: "0!04" is not four bars
// of 0 to it.
const TOKEN = /^(-?(?:\d+\.?\d*|\.\d+))(?:!([1-9]\d*))?$/

// A list as it is written: every value with the bars it stays for and where it stands in the
// text. What plays a list reads it here as well, so that a list is never one thing to the
// controls and another to the ear.
export type Run = { value: string; count: number; from: number; to: number }

export function readRuns(text: string): Run[] | null {
    const list = /^(\s*<)([^<>]*)>\s*$/.exec(text)
    if (!list) return null
    const runs: Run[] = []
    for (const word of list[2].matchAll(/\S+/g)) {
        const token = TOKEN.exec(word[0])
        if (!token) return null
        const from = list[1].length + word.index
        runs.push({ value: token[1], count: token[2] ? Number(token[2]) : 1, from, to: from + token[1].length })
    }
    return runs.length ? runs : null
}

export function parseCurve(text: string): string[] | null {
    const runs = readRuns(text)
    if (!runs) return null
    const values: string[] = []
    for (const run of runs) {
        if (values.length + run.count > MAX_BARS) return null
        for (let i = 0; i < run.count; i++) values.push(run.value)
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

// The fades of a recording that plays along the song are written the same way too. They
// follow where the recording is heard, and are not drawn.
export const curvesOf = (block: PatternBlock): Curve[] => {
    const laid = readLaid(block)
    return block.calls.slice(1).flatMap((call) => (laid && (call === laid.attack || call === laid.release) ? [] : (readCurve(call) ?? [])))
}

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
