// The bars a pattern plays in are written as one digit for each bar of the song, in the
// brackets that make Strudel take one of them per cycle: .mask("<1 1 1 1  0 0 0 0>")
export const MAX_BARS = 64

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
    const groups: string[] = []
    for (let i = 0; i < bars.length; i += 4) {
        groups.push(
            bars
                .slice(i, i + 4)
                .map((on) => (on ? '1' : '0'))
                .join(' '),
        )
    }
    return `<${groups.join('  ')}>`
}
