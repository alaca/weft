import { RangeSetBuilder, StateEffect, StateField, type Text } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'

export type BlockMark = { from: number; to: number; color: string; selected: boolean; muted: boolean }

export const setMarks = StateEffect.define<BlockMark[]>()

function build(doc: Text, marks: BlockMark[]): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>()
    let lastLine = 0
    for (const mark of [...marks].sort((a, b) => a.from - b.from)) {
        const first = Math.max(lastLine + 1, doc.lineAt(Math.min(mark.from, doc.length)).number)
        const last = doc.lineAt(Math.min(mark.to, doc.length)).number
        for (let n = first; n <= last; n++) {
            const line = doc.line(n)
            const classes = ['weft-block', mark.selected ? 'weft-sel' : '', mark.muted ? 'weft-off' : ''].filter(Boolean).join(' ')
            builder.add(line.from, line.from, Decoration.line({ attributes: { class: classes, style: `--h:${mark.color}` } }))
            lastLine = n
        }
    }
    return builder.finish()
}

export const marksField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(value, tr) {
        let next = value.map(tr.changes)
        for (const effect of tr.effects) {
            if (effect.is(setMarks)) next = build(tr.state.doc, effect.value)
        }
        return next
    },
    provide: (field) => EditorView.decorations.from(field),
})
