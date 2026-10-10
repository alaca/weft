import { describe, expect, it } from 'vitest'
import { findDef, fromUnit, soundKind, toUnit, writeNumber } from '../../src/controls/catalog'
import { analyze } from '../../src/song/analyze'

const first = (code: string) => analyze(code).patterns[0]

describe('catalog', () => {
    it('finds a control by its name or a synonym', () => {
        expect(findDef('lpf')?.label).toBe('Cutoff')
        expect(findDef('cutoff')?.fn).toBe('lpf')
        expect(findDef('resonance')?.fn).toBe('lpq')
        expect(findDef('nonsense')).toBeUndefined()
    })

    it('maps a value to a knob position and back, in a straight line', () => {
        expect(toUnit(1200, 200, 4000, 'linear')).toBeCloseTo(0.2632, 4)
        expect(fromUnit(0.5, 0, 30, 'linear')).toBe(15)
        expect(fromUnit(toUnit(8, 0, 30, 'linear'), 0, 30, 'linear')).toBeCloseTo(8)
    })

    it('maps a value to a knob position and back, by ratio', () => {
        expect(toUnit(1000, 100, 10000, 'log')).toBeCloseTo(0.5)
        expect(fromUnit(0.5, 100, 10000, 'log')).toBeCloseTo(1000)
    })

    it('keeps a position between 0 and 1', () => {
        expect(toUnit(-5, 0, 30, 'linear')).toBe(0)
        expect(toUnit(99, 0, 30, 'linear')).toBe(1)
        expect(toUnit(1, 100, 10000, 'log')).toBe(0)
    })

    it('writes numbers with as many decimals as the range deserves', () => {
        expect(writeNumber(1238.4, 200, 4000)).toBe('1238')
        expect(writeNumber(8.3, 0, 30)).toBe('8.3')
        expect(writeNumber(0.2501, 0, 1)).toBe('0.25')
        expect(writeNumber(0.3, 0, 1)).toBe('0.3')
        expect(writeNumber(1, 0, 1.5)).toBe('1')
    })

    it('tells a synth from a sample', () => {
        expect(soundKind(first('x: note("c e").s("sawtooth")'))).toBe('synth')
        expect(soundKind(first('x: note("c e")'))).toBe('synth')
        expect(soundKind(first('x: s("bd*4").bank("RolandTR909")'))).toBe('sample')
        expect(soundKind(first('x: s("bd hh")'))).toBe('sample')
        expect(soundKind(first('x: n("0 2").scale("C:minor").s("gm_epiano1")'))).toBe('sample')
    })
})
