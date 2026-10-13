import { noteToMidi, Pattern } from '@strudel/core'
import { sendNote } from '../library/midi'

// `.midi()` at the end of a pattern sends its notes out, to a synth or to another program, and
// the app itself is silent for that pattern. `.midi("name")` says what to send to, where there
// is more than one thing, and `.midichan(2)` on which channel. Strudel has this in a part the
// app does not load, since that part needs a window that can reach MIDI by itself, which a
// Mac's cannot: here the notes go the way the app's own MIDI goes.
//
// `lit` is told of every note that goes out, so that it is lit in the code as a note that
// sounds in the app is.
let done = false

export function sendNotesOut(lit: (hap: unknown) => void) {
    if (done) return
    done = true
    const pattern = Pattern.prototype as unknown as Record<string, unknown>
    pattern.midi = function (this: { onTrigger(run: (hap: any, now: number, cps: number, at: number) => void): unknown }, output?: unknown) {
        const to = typeof output === 'string' && output ? output : null
        return this.onTrigger((hap, now, cps, at) => {
            lit(hap)
            const value = hap?.value
            if (!value || typeof value !== 'object') return
            const midi = typeof value.note === 'number' ? value.note : typeof value.note === 'string' ? noteToMidi(value.note) : null
            if (midi === null || !Number.isFinite(midi)) return
            // How hard a key is pressed: Strudel's velocity, and how loud the note is besides.
            const force = Math.min(1, Math.max(0, Number(value.velocity ?? 0.9) * Number(value.gain ?? 1)))
            const length = (hap.duration.valueOf() / cps) * 1000 - 10
            sendNote(to, Number(value.midichan ?? 1), midi, Math.round(force * 127), Math.max(0, (at - now) * 1000), Math.max(10, length))
        })
    }
}
