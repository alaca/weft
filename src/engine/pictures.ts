import { Pattern } from '@strudel/core'
import { registerWidgetType } from '@strudel/transpiler'

// Strudel has two of each picture: `pianoroll`, drawn large behind everything on its page, and
// `_pianoroll`, drawn small under the line that asks for it. Here the first is the second,
// because a picture belongs under the code that asks for it, whichever of the two is written.
const TWINS: Record<string, string> = {
    pianoroll: '_pianoroll',
    punchcard: '_punchcard',
    spiral: '_spiral',
    pitchwheel: '_pitchwheel',
    scope: '_scope',
    tscope: '_scope',
    spectrum: '_spectrum',
}

// The pictures that have no small twin, and are still drawn on Strudel's one large canvas.
export const LARGE_ONLY = ['fscope', 'draw', 'onPaint', 'animate']

// A wordfall is Strudel's punchcard stood on end, with the name of each note on it. Small, it is
// the small punchcard stood on end, tall enough to read.
const WORDFALL = { vertical: 1, labels: 1, stroke: 0, fillActive: 1, active: 'white', height: 200 }

let done = false

export function drawInTheCode() {
    if (done) return
    done = true
    const pattern = Pattern.prototype as Record<string, unknown>
    for (const [name, twin] of Object.entries(TWINS)) {
        const large = pattern[name]
        const small = pattern[twin]
        if (typeof large !== 'function' || typeof small !== 'function') continue
        // From here on Strudel hands the call the place it stands at in the code, as a text.
        registerWidgetType(name)
        // With that text it is the small picture. The small picture in its turn calls this with
        // what to draw on, and then it is Strudel's own drawing.
        pattern[name] = function (this: unknown, first: unknown, options?: unknown) {
            return typeof first === 'string' ? small.call(this, first, options) : large.call(this, first, options)
        }
    }
    const large = pattern.wordfall
    const small = pattern._punchcard
    if (typeof large !== 'function' || typeof small !== 'function') return
    registerWidgetType('wordfall')
    pattern.wordfall = function (this: unknown, first: unknown, options?: Record<string, unknown>) {
        return typeof first === 'string' ? small.call(this, first, { ...WORDFALL, ...options }) : large.call(this, first, options)
    }
}
