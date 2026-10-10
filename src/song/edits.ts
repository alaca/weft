import type { Arg, Call, PatternBlock, TextEdit } from './types'

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
