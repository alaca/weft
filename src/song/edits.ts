import type { PatternBlock, TextEdit } from './types'

export function toggleMute(block: PatternBlock): TextEdit {
    if (!block.muted) return { from: block.labelFrom, to: block.labelFrom, insert: '_' }
    if (block.label.startsWith('_')) return { from: block.labelFrom, to: block.labelFrom + 1, insert: '' }
    return { from: block.labelTo - 1, to: block.labelTo, insert: '' }
}

export function applyEdit(code: string, edit: TextEdit): string {
    return code.slice(0, edit.from) + edit.insert + code.slice(edit.to)
}
