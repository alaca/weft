import type { Arg, Call, PatternBlock, Song, TextEdit } from './types'

type Numeric = Extract<Arg, { kind: 'number' | 'slider' }>

export function toggleMute(block: PatternBlock): TextEdit {
    if (!block.muted) return { from: block.labelFrom, to: block.labelFrom, insert: '_' }
    if (block.label.startsWith('_')) return { from: block.labelFrom, to: block.labelFrom + 1, insert: '' }
    return { from: block.labelTo - 1, to: block.labelTo, insert: '' }
}

export function setNumber(arg: Numeric, text: string): TextEdit {
    return arg.kind === 'slider' ? { from: arg.valueFrom, to: arg.valueTo, insert: text } : { from: arg.from, to: arg.to, insert: text }
}

export function addCall(code: string, block: PatternBlock, callText: string): TextEdit {
    const lines = code.slice(block.from, block.to).split('\n')
    const found = lines.length > 1 ? /^[ \t]*/.exec(lines[1])?.[0] : ''
    return { from: block.to, to: block.to, insert: `\n${found || '  '}${callText}` }
}

export function removeCall(call: Call): TextEdit {
    return { from: call.from, to: call.to, insert: '' }
}

export function applyEdit(code: string, edit: TextEdit): string {
    return code.slice(0, edit.from) + edit.insert + code.slice(edit.to)
}

export function setString(arg: Extract<Arg, { kind: 'string' }>, value: string): TextEdit {
    return { from: arg.from + 1, to: arg.to - 1, insert: value }
}

export function renameCalls(calls: Call[], rename: (name: string) => string | null): TextEdit[] {
    return calls.flatMap((call) => {
        const next = rename(call.name)
        return next && next !== call.name ? [{ from: call.nameFrom, to: call.nameTo, insert: next }] : []
    })
}

export function setTempo(song: Song, bpm: number): TextEdit {
    if (song.tempo) {
        return { from: song.tempo.from, to: song.tempo.to, insert: song.tempo.unit === 'cpm' ? `${bpm}/4` : `${bpm}/240` }
    }
    return { from: song.insertAt, to: song.insertAt, insert: `setcpm(${bpm}/4)\n\n` }
}

export function applyEdits(code: string, edits: TextEdit[]): string {
    return [...edits].sort((a, b) => b.from - a.from).reduce(applyEdit, code)
}
