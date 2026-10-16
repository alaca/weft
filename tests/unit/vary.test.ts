import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { applyEdit } from '../../src/song/edits'
import { METERS, USUAL } from '../../src/song/meter'
import { readVaried, varyEdit, variedCount, type Kind, type Value } from '../../src/song/vary'

const BASS = 'setcpm(120/4)\n\nbass: note(`c2 ~ e2 g2`)\n  .s("sawtooth")\n  .mask("<0!4 1!12>")\n'
const first = (code: string) => analyze(code).patterns[0]
const read = (code: string, meter = USUAL) => readVaried(code, first(code), meter)

function vary<K extends Kind>(code: string, kind: K, value: Value<K>, meter = USUAL, notes = true): string {
    const edit = varyEdit(code, first(code), meter, kind, value, notes)
    return edit ? applyEdit(code, edit) : code
}

describe('a pattern varied without code', () => {
    it('reads each variation from the calls Strudel plays, typed or chosen', () => {
        const code = 'bass: note(`c2 e2`)\n  .lastOf(4, fast( 2 ))\n  .late(0.0625)\n  .rev()\n  .iter(4)\n  .off(0.125, add(note(12)))\n  .struct("t(5,8)")\n'
        expect(read(code)).toEqual({ every: { bars: 4, change: 'faster' }, shift: 1, backwards: true, turn: 4, echo: 2, spread: [5, 8] })
        expect(variedCount(read(code))).toBe(6)
        expect(variedCount(read(BASS))).toBe(0)
    })

    it('writes a variation before the line of the bars, changes it where it stands, and takes it away again', () => {
        const every = vary(BASS, 'every', { bars: 4, change: 'twice' })
        expect(every).toContain('.s("sawtooth")\n  .lastOf(4, ply(2))\n  .mask("<0!4 1!12>")')
        const changed = vary(every, 'every', { bars: 8, change: 'octave' })
        expect(changed).toContain('  .lastOf(8, add(note(12)))\n  .mask(')
        expect(read(changed).every).toEqual({ bars: 8, change: 'octave' })
        expect(vary(changed, 'every', null)).toBe(BASS)
    })

    it('counts a shift and an echo in sixteenths of the bar the song is in', () => {
        const waltz = METERS.find((meter) => meter.label === '3/4')!
        const early = vary(BASS, 'shift', -1, waltz)
        expect(early).toContain('.early(0.0833)')
        expect(read(early, waltz).shift).toBe(-1)
        expect(vary(BASS, 'shift', 2)).toContain('.late(0.125)')
        expect(vary(BASS, 'echo', 1)).toContain('.off(0.0625, add(note(12)))')
        expect(vary(BASS, 'echo', 2, USUAL, false)).toContain('.off(0.125, mul(gain(0.5)))')
    })

    it('leaves alone calls of the same name that say something else', () => {
        const own = 'bass: note(`c2 e2`)\n  .lastOf(3, x => x.slow(2))\n  .struct("x ~ x x")\n'
        expect(read(own)).toEqual({ every: null, shift: null, backwards: false, turn: null, echo: null, spread: null })
        expect(vary(own, 'every', { bars: 4, change: 'faster' })).toContain('.lastOf(3, x => x.slow(2))\n  .struct("x ~ x x")\n  .lastOf(4, fast(2))')
    })
})
