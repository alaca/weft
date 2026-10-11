import { curveText, parseCurve } from './curves'
import { setString } from './edits'
import type { PatternBlock, TextEdit } from './types'

// The versions of a pattern, for a song in which the same pattern plays one thing in the verse
// and another in the chorus with the same sound and the same knobs. How they are written is
// said where they are read, in analyze.ts.
export const MOST_VARIANTS = 8
export const variantName = (index: number): string => String.fromCharCode(65 + index)

// Which version each bar of the song takes. A pattern without versions has the one.
export function variantBars(block: PatternBlock, length: number): number[] {
    const written = block.variants ? (parseCurve(block.variants.chooser.value) ?? []).map(Number) : []
    const most = (block.variants?.items.length ?? 1) - 1
    return Array.from({ length }, (_, bar) => (written.length ? Math.min(most, written[bar % written.length]) : 0))
}

export const choiceText = (bars: number[]): string => curveText(bars.map(String))

export function chooseEdit(block: PatternBlock, bars: number[]): TextEdit | null {
    if (!block.variants) return null
    const text = choiceText(bars)
    return text === block.variants.chooser.value ? null : setString(block.variants.chooser, text)
}

// The rows of choices follow the song when it is made longer or shorter or has bars put into
// it, the way everything else that is written bar by bar does.
export function followChoices(blocks: PatternBlock[], length: number, change: (bars: number[]) => number[], but?: string): TextEdit[] {
    return blocks.flatMap((block) => {
        const written = block.variants && block.id !== but ? parseCurve(block.variants.chooser.value) : null
        if (!block.variants || !written || written.length !== length) return []
        const edit = chooseEdit(block, change(written.map(Number)))
        return edit ? [edit] : []
    })
}

// What a version is made of: what the pattern plays, with the count of bars it is long when
// that is written straight after it. Everything that follows is shared by all versions.
function sourceOf(block: PatternBlock): { from: number; to: number } | null {
    const first = block.calls[0]
    if (!first || block.inline) return null
    const next = block.calls[1]
    return { from: first.from, to: next?.name === 'slow' && next.from === first.to ? next.to : first.to }
}

// One more version, a copy of the one in sight to change from there. The first time, the
// pattern is made into a list of two, and every bar keeps the one it had.
export function addVariant(code: string, block: PatternBlock, length: number): { edit: TextEdit; index: number } | null {
    if (block.variants) {
        const { items, shown } = block.variants
        if (items.length >= MOST_VARIANTS) return null
        const last = items[items.length - 1]
        return { edit: { from: last.to, to: last.to, insert: `,\n  ${code.slice(items[shown].from, items[shown].to)}` }, index: items.length }
    }
    const source = sourceOf(block)
    if (!source) return null
    const text = code.slice(source.from, source.to)
    return { edit: { from: source.from, to: source.to, insert: `"${choiceText(Array.from({ length }, () => 0))}".pick([\n  ${text},\n  ${text},\n])` }, index: 1 }
}

// A version taken away. The bars that had it take the first one, and when a single version
// is left the pattern is written the plain way again.
export function removeVariant(code: string, block: PatternBlock, index: number, length: number): TextEdit[] | null {
    const variants = block.variants
    if (!variants || index < 0 || index >= variants.items.length || variants.items.length < 2) return null
    if (variants.items.length === 2) {
        const kept = variants.items[index === 0 ? 1 : 0]
        return [{ from: variants.from, to: variants.to, insert: code.slice(kept.from, kept.to) }]
    }
    const item = variants.items[index]
    const cut = index === 0 ? { from: item.from, to: variants.items[1].from } : { from: variants.items[index - 1].to, to: item.to }
    const bars = variantBars(block, length).map((at) => (at === index ? 0 : at > index ? at - 1 : at))
    return [{ ...cut, insert: '' }, setString(variants.chooser, choiceText(bars))]
}
