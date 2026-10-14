import { describe, expect, it } from 'vitest'
import { tapped } from '../../src/song/tap'

const tap = (times: number[]) => times.reduce<{ taps: number[]; bpm: number | null }>((was, at) => tapped(was.taps, at), { taps: [], bpm: null })

describe('a tempo tapped in time', () => {
    it('is known from the second tap, and goes by the gaps of the last eight', () => {
        expect(tap([1000]).bpm).toBeNull()
        expect(tap([1000, 1500]).bpm).toBe(120)
        expect(tap([1000, 1500, 2010, 2490, 3000]).bpm).toBe(120)
        expect(tap([0, 400, 800, 1200, 1700, 2200, 2700, 3200, 3700, 4200, 4700]).bpm).toBe(120)
    })

    it('starts again after a pause, and stays between 20 and 300', () => {
        expect(tap([1000, 1500, 5000]).bpm).toBeNull()
        expect(tap([1000, 1500, 5000, 5400]).bpm).toBe(150)
        expect(tap([0, 100]).bpm).toBe(300)
        expect(tap([0, 1990]).bpm).toBe(30)
    })
})
