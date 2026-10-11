import { describe, expect, it } from 'vitest'
import { controlOf, drawableIn, drawnIn } from '../../src/controls/views'
import { analyze } from '../../src/song/analyze'
import { curveOver, curveText, curvesOf, followSong, parseCurve, readCurve, stretched } from '../../src/song/curves'

const SONG = `setcpm(120/4)

bass: note("c2 e2")
  .s("sawtooth")
  .lpf("<400!4 900!2 2400 3000>")
  .lpq(slider(8, 0, 30))
  .room(0.3)
  .swingBy(slider(0.2, 0, 0.5), 8)
  .gain(sine.range(0.2, 0.8).slow(4))
  .n("<0 3 5>")
  .mask("<1!6 0!2>")
`

const block = (code = SONG) => analyze(code).patterns[0]
const apply = (code: string, edits: { from: number; to: number; insert: string }[]) => [...edits].sort((a, b) => b.from - a.from).reduce((text, edit) => text.slice(0, edit.from) + edit.insert + text.slice(edit.to), code)

describe('a value written bar by bar', () => {
    it('is read as the number of every bar, as it is written, and written back with runs counted', () => {
        expect(parseCurve('<400!4 900!2 2400 3000>')).toEqual(['400', '400', '400', '400', '900', '900', '2400', '3000'])
        expect(parseCurve(' < 0.5 .25!2 -1 > ')).toEqual(['0.5', '.25', '.25', '-1'])
        expect(curveText(['400', '400', '400', '900', '400'])).toBe('<400!3 900 400>')
        expect(curveText(parseCurve('<0.50!2 0.5>')!)).toBe('<0.50!2 0.5>')
    })

    it('is nothing else: no notes, no words, no steps, nothing outside the brackets', () => {
        for (const text of ['<c2 e2>', '400 900', '<400 [900 1200]>', '<>', '<400*2>', '<400!0>', '<1e3>', 'x ~ x ~']) expect(parseCurve(text), text).toBeNull()
    })

    it('is found on the calls of a pattern, and the bars the pattern plays in are not one', () => {
        expect(curvesOf(block()).map((curve) => curve.call.name)).toEqual(['lpf', 'n'])
        expect(readCurve(block().calls.find((call) => call.name === 'mask'))).toBeNull()
    })

    it('goes round when it is shorter than the song, and goes on at its last value when it is made longer', () => {
        expect(curveOver(['1', '2', '3'], 7)).toEqual(['1', '2', '3', '1', '2', '3', '1'])
        expect(stretched(['1', '2', '3'], 5)).toEqual(['1', '2', '3', '3', '3'])
        expect(stretched(['1', '2', '3'], 2)).toEqual(['1', '2'])
    })

    it('follows the song when it was as long as the song, and is left alone when it was not', () => {
        const longer = apply(SONG, followSong([block()], 8, (values) => stretched(values, 10)))
        expect(longer).toContain('.lpf("<400!4 900!2 2400 3000!3>")')
        expect(longer).toContain('.n("<0 3 5>")')
        const repeated = apply(SONG, followSong([block()], 8, (values) => [...values.slice(0, 6), ...values.slice(4, 6), ...values.slice(6)]))
        expect(repeated).toContain('.lpf("<400!4 900!4 2400 3000>")')
        expect(followSong([block()], 8, (values) => values)).toEqual([])
        expect(followSong([block()], 16, (values) => stretched(values, 20))).toEqual([])
    })
})

describe('the knob of a value that is written bar by bar', () => {
    it('is shown as drawn, with the value of every bar and the lowest and highest of them', () => {
        const cutoff = controlOf(block(), 'lpf')
        expect(cutoff.state).toBe('drawn')
        expect(cutoff.curve).toEqual([400, 400, 400, 400, 900, 900, 2400, 3000])
        expect(cutoff.text).toBe('400 to 3000 Hz')
        expect(controlOf(block(SONG.replace('<400!4 900!2 2400 3000>', '<650!8>')), 'lpf').text).toBe('650 Hz')
        expect(drawnIn(block()).map((view) => view.fn)).toEqual(['lpf'])
    })

    it('widens to hold a value past what the knob usually goes to', () => {
        const cutoff = controlOf(block(SONG.replace('<400!4 900!2 2400 3000>', '<50 12000>')), 'lpf')
        expect([cutoff.min, cutoff.max]).toEqual([50, 12000])
    })

    it('can be drawn when it is a number, a slider or a motion, and not when it is written with more around it', () => {
        expect(drawableIn(block()).map((view) => view.fn)).toEqual(['lpq', 'room', 'gain'])
    })

    it('is not taken for drawn when the call is one the controls do not know', () => {
        expect(drawnIn(block()).some((view) => view.fn === 'n')).toBe(false)
    })
})
