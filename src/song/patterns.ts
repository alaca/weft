import type { PatternBlock, TextEdit } from './types'

export type StarterKind = 'drums' | 'bass' | 'chords' | 'melody'

export type Starter = {
    kind: StarterKind
    label: string
    name: string
    rows?: string[]
    range?: { low: number; high: number }
}

// A new pattern starts with nothing in it. What a starter chooses is the kind of pattern, its
// sound, and what the empty grid or roll shows first: the drum rows, or the range of notes.
export const PATTERN_STARTERS: Starter[] = [
    { kind: 'drums', label: 'Drums', name: 'drums', rows: ['bd', 'sd', 'cp', 'hh'] },
    { kind: 'bass', label: 'Bass line', name: 'bass', range: { low: 28, high: 45 } },
    { kind: 'chords', label: 'Chords', name: 'chords', range: { low: 48, high: 67 } },
    { kind: 'melody', label: 'Melody', name: 'melody', range: { low: 60, high: 79 } },
]

export function starterCode(kind: StarterKind, name: string): string {
    switch (kind) {
        case 'drums':
            return `${name}: s("~")\n  .bank("RolandTR909")`
        case 'bass':
            return `${name}: note("~")\n  .s("sawtooth")\n  .lpf(slider(900, 100, 8000))`
        case 'chords':
            return `${name}: note("~")\n  .s("gm_epiano1")\n  .room(slider(0.3, 0, 1))`
        case 'melody':
            return `${name}: note("~")\n  .s("triangle")\n  .delay(slider(0.25, 0, 1))`
    }
}

export function freeName(base: string, taken: string[]): string {
    const used = new Set(taken.map((name) => name.toLowerCase()))
    if (!used.has(base)) return base
    let count = 2
    while (used.has(`${base}${count}`)) count++
    return `${base}${count}`
}

export function appendPattern(code: string, text: string): TextEdit {
    const end = code.trimEnd().length
    return { from: end, to: code.length, insert: `${end ? '\n\n' : ''}${text}\n` }
}

export function removePattern(code: string, block: PatternBlock): TextEdit {
    const lineEnd = /^[ \t]*(?=\n|$)/.exec(code.slice(block.to))
    if (!lineEnd) {
        const spaces = /^[ \t]*/.exec(code.slice(block.to))?.[0].length ?? 0
        return { from: block.from, to: block.to + spaces, insert: '' }
    }
    const to = block.to + lineEnd[0].length
    const kept = code.slice(0, block.from).trimEnd().length
    if (kept > 0) return { from: kept, to, insert: '' }
    const after = /^\s*/.exec(code.slice(to))?.[0].length ?? 0
    return { from: 0, to: to + after, insert: '' }
}
