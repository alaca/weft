import { describe, expect, it } from 'vitest'
import { envelopeOf, envelopePoints } from '../../src/controls/envelope'
import { analyze } from '../../src/song/analyze'

const first = (code: string) => analyze(code).patterns[0]

describe('envelopeOf', () => {
    it('uses Strudel\'s defaults when nothing is set', () => {
        expect(envelopeOf(first('x: note("c")'))).toEqual({ attack: 0.001, decay: 0.001, sustain: 1, release: 0.01 })
    })

    it('holds at nothing when only decay is set, as Strudel does', () => {
        expect(envelopeOf(first('x: note("c").decay(.18)'))).toEqual({ attack: 0.001, decay: 0.18, sustain: 0.001, release: 0.01 })
    })

    it('holds at full level when only attack is set', () => {
        expect(envelopeOf(first('x: note("c").attack(0.3)'))).toMatchObject({ attack: 0.3, sustain: 1 })
    })

    it('reads values from sliders and synonyms', () => {
        expect(envelopeOf(first('x: note("c").att(slider(0.2, 0, 1)).sus(0.4).rel(0.5)'))).toEqual({ attack: 0.2, decay: 0.001, sustain: 0.4, release: 0.5 })
    })
})

describe('envelopePoints', () => {
    it('starts and ends on the floor and rises to the top after the attack', () => {
        const points = envelopePoints({ attack: 0.2, decay: 0.3, sustain: 0.5, release: 0.4 }, 180, 44)
        expect(points).toHaveLength(5)
        expect(points[0]).toEqual([0, 43])
        expect(points[1][1]).toBe(2)
        expect(points[2][1]).toBeCloseTo(22.5)
        expect(points[3][1]).toBeCloseTo(22.5)
        expect(points[4]).toEqual([180, 43])
    })

    it('moves left to right', () => {
        const xs = envelopePoints({ attack: 0.001, decay: 0.18, sustain: 0.001, release: 0.01 }, 180, 44).map((p) => p[0])
        expect([...xs].sort((a, b) => a - b)).toEqual(xs)
        expect(new Set(xs).size).toBe(5)
    })
})
