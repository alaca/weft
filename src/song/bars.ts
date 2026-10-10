// The bars a pattern plays in are written as runs of bars that play (1) or rest (0), in the
// brackets that make Strudel take one bar per cycle: .mask("<0!4 1!12>") rests for four bars and
// plays for twelve. A song can be thousands of bars long, so a run is a count and not a row of digits.
export const MAX_BARS = 4096

const TOKEN = /^([01])(?:!(\d+))?$/

export function parseBars(text: string): boolean[] | null {
    const inner = /^\s*<([^<>]*)>\s*$/.exec(text)
    if (!inner) return null
    const bars: boolean[] = []
    for (const token of inner[1].trim().split(/\s+/)) {
        const match = TOKEN.exec(token)
        const count = match?.[2] ? Number(match[2]) : 1
        if (!match || count < 1 || bars.length + count > MAX_BARS) return null
        for (let i = 0; i < count; i++) bars.push(match[1] === '1')
    }
    return bars
}

export function barsText(bars: boolean[]): string {
    const runs: string[] = []
    for (let from = 0; from < bars.length; ) {
        let to = from
        while (to < bars.length && bars[to] === bars[from]) to++
        runs.push(`${bars[from] ? 1 : 0}${to - from > 1 ? `!${to - from}` : ''}`)
        from = to
    }
    return `<${runs.join(' ')}>`
}
