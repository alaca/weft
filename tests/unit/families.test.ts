import { describe, expect, it } from 'vitest'
import { filterTypeOf, findDef } from '../../src/controls/catalog'
import { browserItems, panelFor } from '../../src/controls/views'
import { analyze } from '../../src/song/analyze'

const first = (code: string) => analyze(code).patterns[0]
const filterGroup = (code: string, type?: 'low' | 'high' | 'band') =>
    panelFor(first(code), type).find((g) => g.group === 'filter')!.items.map((v) => [v.fn, v.state])

describe('filter families', () => {
    it('reads the filter type from the code', () => {
        expect(filterTypeOf(first('x: note("c").lpf(800)'))).toBe('low')
        expect(filterTypeOf(first('x: note("c").hpq(4)'))).toBe('high')
        expect(filterTypeOf(first('x: note("c").bandf(800)'))).toBe('band')
        expect(filterTypeOf(first('x: note("c")'))).toBeNull()
    })

    it('shows the family that is in the code', () => {
        expect(filterGroup('x: note("c").hpf(300)')).toEqual([['hpf', 'number'], ['hpq', 'faint'], ['hpenv', 'faint']])
    })

    it('shows the requested family when the code has no filter', () => {
        expect(filterGroup('x: note("c")', 'band')).toEqual([['bpf', 'faint'], ['bpq', 'faint'], ['bpenv', 'faint']])
        expect(filterGroup('x: note("c")')).toEqual([['lpf', 'faint'], ['lpq', 'faint'], ['lpenv', 'faint']])
    })

    it('names the three cutoffs differently', () => {
        expect([findDef('lpf')?.label, findDef('hpf')?.label, findDef('bpf')?.label]).toEqual(['Cutoff', 'Low cut', 'Band centre'])
    })
})

describe('browserItems', () => {
    const fns = (code: string) => browserItems(first(code), 'low').map((def) => def.fn)

    it('offers controls that are neither starters nor in the code', () => {
        const offered = fns('x: note("c").s("sawtooth")')
        expect(offered).toContain('phaser')
        expect(offered).toContain('crush')
        expect(offered).toContain('lpdecay')
        expect(offered).not.toContain('lpf')
        expect(offered).not.toContain('delay')
        expect(offered).toContain('gain')
        expect(offered).not.toContain('volume')
        expect(offered).not.toContain('degradeBy')
    })

    it('leaves out what is already in the code', () => {
        expect(fns('x: note("c").phaser(1)')).not.toContain('phaser')
    })

    it('leaves out the other filter families', () => {
        const offered = fns('x: note("c")')
        expect(offered).not.toContain('hpf')
        expect(offered).not.toContain('bpq')
    })

    it('keeps synth controls for synths and sample controls for samples', () => {
        expect(fns('x: note("c").s("sawtooth")')).toContain('vibmod')
        expect(fns('x: note("c").s("sawtooth")')).not.toContain('speed')
        expect(fns('x: s("bd*4")')).not.toContain('vibmod')
        expect(fns('x: s("bd*4")')).not.toContain('speed')
        expect(fns('x: s("bd*4")')).toContain('crush')
    })
})
