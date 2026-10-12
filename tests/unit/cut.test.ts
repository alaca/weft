import { describe, expect, it } from 'vitest'
import { cutAt } from '../../src/engine/cut'

const moment = (at: number) => ({ valueOf: () => at })
const asked = (begin: number, end: number) => ({ span: { begin: moment(begin), end: moment(end) } })

// A pattern with a note on every quarter of a bar, which counts how often it is asked.
const quarters = () => {
    const pattern = {
        times: 0,
        ask(state: ReturnType<typeof asked>) {
            pattern.times++
            const notes: { whole: { begin: { valueOf(): number } }; part: { begin: { valueOf(): number } } }[] = []
            for (let at = Math.ceil(state.span.begin.valueOf() * 4) / 4; at < state.span.end.valueOf(); at += 0.25) notes.push({ whole: { begin: moment(at) }, part: { begin: moment(at) } })
            return notes
        },
    }
    return pattern
}
const begins = (notes: { whole: { begin: { valueOf(): number } } }[]) => notes.map((note) => note.whole.begin.valueOf())

describe('a pattern cut at a bar', () => {
    it('plays on until the bar when it is switched off, and is not asked from there on', () => {
        const pattern = quarters()
        const off = cutAt(pattern.ask, 8, 'before')
        expect(begins(off(asked(7, 8)))).toEqual([7, 7.25, 7.5, 7.75])
        expect(begins(off(asked(7.7, 8.05)))).toEqual([7.75])
        expect(pattern.times).toBe(2)
        expect(off(asked(8, 8.05))).toEqual([])
        expect(off(asked(11, 12))).toEqual([])
        expect(pattern.times).toBe(2)
    })

    it('rests until the bar when it is switched on, without being asked, and plays its first note on it', () => {
        const pattern = quarters()
        const on = cutAt(pattern.ask, 8, 'from')
        expect(on(asked(7, 8))).toEqual([])
        expect(on(asked(7.95, 8))).toEqual([])
        expect(pattern.times).toBe(0)
        expect(begins(on(asked(7.7, 8.05)))).toEqual([8])
        expect(begins(on(asked(8, 9)))).toEqual([8, 8.25, 8.5, 8.75])
    })

    it('gives every note to one side and to one side only', () => {
        const stretches = [asked(7.5, 7.95), asked(7.95, 8.3), asked(8.3, 9)]
        const of = (keep: 'before' | 'from') => stretches.flatMap((stretch) => begins(cutAt(quarters().ask, 8, keep)(stretch)))
        expect(of('before')).toEqual([7.5, 7.75])
        expect(of('from')).toEqual([8, 8.25, 8.5, 8.75])
    })

    it('goes by where the whole note begins, and by the part that is asked for when a note has no whole', () => {
        const ringing = { whole: { begin: moment(7.5) }, part: { begin: moment(8) } }
        const bare = { part: { begin: moment(8.1) } }
        const both = () => [ringing, bare]
        expect(cutAt(both, 8, 'before')(asked(7.9, 8.2))).toEqual([ringing])
        expect(cutAt(both, 8, 'from')(asked(7.9, 8.2))).toEqual([bare])
    })
})
