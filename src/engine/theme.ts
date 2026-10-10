import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { settings, themes } from '@strudel/codemirror'

const LINEN = '#ece6d6'
const LINEN_2 = '#b9b6af'
const LINEN_3 = '#8d8b86'

const colors = {
    background: '#1f1f22',
    lineBackground: '#1f1f2299',
    foreground: LINEN_2,
    caret: LINEN,
    selection: 'rgba(236, 230, 214, 0.18)',
    selectionMatch: 'rgba(236, 230, 214, 0.1)',
    lineHighlight: '#00000030',
    gutterBackground: 'transparent',
    gutterForeground: '#8d8b8699',
}

export function registerTheme(): void {
    if (themes.weft) return
    settings.weft = colors
    themes.weft = [
        EditorView.theme(
            {
                '&': { color: colors.foreground, backgroundColor: 'transparent' },
                '.cm-gutters': { backgroundColor: colors.gutterBackground, color: colors.gutterForeground },
                '.cm-content': { caretColor: colors.caret },
                '.cm-cursor, .cm-dropCursor': { borderLeftColor: colors.caret },
                '&.cm-focused .cm-selectionBackground, & .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection': {
                    background: `${colors.selection} !important`,
                },
            },
            { dark: true },
        ),
        syntaxHighlighting(
            HighlightStyle.define([
                { tag: t.labelName, color: `var(--h, ${LINEN})`, fontWeight: '600' },
                { tag: t.comment, color: LINEN_3, fontStyle: 'italic' },
                { tag: [t.string, t.special(t.string)], color: LINEN },
                { tag: [t.number, t.bool, t.atom], color: LINEN },
                { tag: [t.propertyName, t.variableName, t.definition(t.variableName)], color: LINEN },
                { tag: [t.keyword, t.operator], color: LINEN_2 },
                { tag: [t.bracket, t.punctuation], color: LINEN_3 },
            ]),
        ),
    ]
}
