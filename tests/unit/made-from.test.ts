import { describe, expect, it } from 'vitest'
import { madeFrom } from '../../src/engine/madeFrom'

describe('the bar a recording that starts later is made from', () => {
    it('is the first bar for a recording of the whole song, and nothing is asked', () => {
        let asked = 0
        const begins = () => (asked++, [0])
        expect(madeFrom(0, 2, begins)).toBe(0)
        expect(asked).toBe(0)
    })

    it('is a few bars before the start when every sound heard there begins there', () => {
        expect(madeFrom(69, 2, () => [69, 69.25, 69.5])).toBe(67)
        expect(madeFrom(69, 2, () => [])).toBe(67)
    })

    it('is never before the first bar', () => {
        expect(madeFrom(1, 2, () => [1, 1.5])).toBe(0)
        expect(madeFrom(2, 2, () => [0.5])).toBe(0)
    })

    it('is the bar a note heard at the start began in, when that is earlier', () => {
        expect(madeFrom(69, 2, () => [69, 64, 69.5])).toBe(64)
        expect(madeFrom(69, 2, () => [62.75, 64])).toBe(62)
    })

    it('stays a few bars before the start for a note that began later than that', () => {
        expect(madeFrom(69, 2, () => [68.5, 69])).toBe(67)
    })

    it('is the bar a note began in that ends right where the recording starts', () => {
        const chords = (bar: number) => [Math.floor(bar / 4) * 4]
        expect(madeFrom(20, 2, chords)).toBe(16)
        expect(madeFrom(21, 2, chords)).toBe(16)
        expect(madeFrom(22, 2, chords)).toBe(20)
    })

    it('asks what is heard in the bars before the start and in the bar the recording starts at', () => {
        const asked: number[] = []
        madeFrom(12, 2, (bar) => (asked.push(bar), []))
        expect(asked).toEqual([10, 11, 12])
        asked.length = 0
        madeFrom(1, 2, (bar) => (asked.push(bar), []))
        expect(asked).toEqual([0, 1])
    })
})
