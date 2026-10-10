import { describe, expect, it } from 'vitest'
import { browserItems, callFor, favourites, panelFor, panOf, volumeOf } from '../../src/controls/views'
import { analyze } from '../../src/song/analyze'

const first = (code: string) => analyze(code).patterns[0]
const BASS = 'bass: note("d2").s("sawtooth").lpf(slider(1200, 200, 4000)).lpq(8).pan(sine.slow(4)).gain(0.6)'

describe('favourites', () => {
    it('shows the controls that are in the code, in code order, without volume and pan', () => {
        expect(favourites(first(BASS)).map((v) => [v.fn, v.state])).toEqual([
            ['lpf', 'live'],
            ['lpq', 'number'],
        ])
    })

    it('takes a live knob\'s range from its slider', () => {
        const [cutoff] = favourites(first(BASS))
        expect(cutoff).toMatchObject({ label: 'Cutoff', value: 1200, min: 200, max: 4000, scale: 'linear', text: '1200 Hz' })
    })

    it('takes a plain number\'s range from the catalogue', () => {
        const resonance = favourites(first(BASS))[1]
        expect(resonance).toMatchObject({ label: 'Resonance', value: 8, min: 0, max: 30, text: '8' })
    })

    it('widens the range when the number is outside it', () => {
        expect(favourites(first('x: note("c").lpq(40)'))[0]).toMatchObject({ value: 40, max: 40 })
    })

    it('says a locked knob is set in code', () => {
        expect(favourites(first('x: note("c").lpf(sine.range(200, 2000))'))[0]).toMatchObject({ label: 'Cutoff', state: 'locked', text: 'in code' })
    })

    it('gives any other slider a knob named after its function', () => {
        const [skip, other] = favourites(first('x: s("bd*4").degradeBy(slider(0.2, 0, 1)).foo(slider(1, 0, 2))'))
        expect(skip).toMatchObject({ fn: 'degradeBy', label: 'Skip hits', state: 'live', value: 0.2 })
        expect(other).toMatchObject({ fn: 'foo', label: 'foo', state: 'live', max: 2 })
    })

    it('shows at most four', () => {
        const code = 'x: note("c").lpf(800).lpq(4).lpenv(2).attack(0.1).decay(0.2).room(0.3)'
        expect(favourites(first(code)).map((v) => v.fn)).toEqual(['lpf', 'lpq', 'lpenv', 'attack'])
    })
})

describe('panelFor', () => {
    it('has four groups', () => {
        expect(panelFor(first(BASS)).map((g) => g.group)).toEqual(['source', 'filter', 'shape', 'effects'])
    })

    it('fills each group with its starters, faint when they are not in the code', () => {
        const panel = panelFor(first(BASS))
        const of = (group: string) => panel.find((g) => g.group === group)!.items.map((v) => [v.fn, v.state])
        expect(of('source')).toEqual([['vib', 'faint'], ['noise', 'faint'], ['fm', 'faint']])
        expect(of('filter')).toEqual([['lpf', 'live'], ['lpq', 'number'], ['lpenv', 'faint']])
        expect(of('shape')).toEqual([['attack', 'faint'], ['decay', 'faint'], ['sustain', 'faint'], ['release', 'faint']])
        expect(of('effects')).toEqual([['delay', 'faint'], ['pan', 'locked'], ['room', 'faint']])
    })

    it('puts a control that is in the code but not a starter after the starters', () => {
        const effects = panelFor(first('x: note("c").distort(1)')).find((g) => g.group === 'effects')!
        expect(effects.items.map((v) => v.fn)).toEqual(['delay', 'pan', 'room', 'distort'])
    })

    it('offers the ratio and the fade of the metal beside it, once the metal is in the code', () => {
        const source = (code: string) => panelFor(first(code)).find((g) => g.group === 'source')!.items.map((v) => [v.fn, v.state])
        expect(source('x: note("c").s("sine").fm(3)')).toEqual([['vib', 'faint'], ['noise', 'faint'], ['fm', 'number'], ['fmh', 'faint'], ['fmdecay', 'faint']])
        expect(source('x: note("c").s("sine").fmdecay(slider(0.3, 0, 2)).fmi(3)')).toEqual([['vib', 'faint'], ['noise', 'faint'], ['fm', 'number'], ['fmh', 'faint'], ['fmdecay', 'live']])
        expect(source('x: note("c").s("sine").fmh(2)')).toEqual([['vib', 'faint'], ['noise', 'faint'], ['fm', 'faint'], ['fmh', 'number']])
    })

    it('keeps a control that needs another out of the list of all controls', () => {
        const names = (code: string) => browserItems(first(code), 'low').map((def) => def.fn)
        expect(names('x: note("c").s("sine")')).not.toContain('fmh')
        expect(names('x: note("c").s("sine").fm(3)')).not.toContain('fmdecay')
    })

    it('uses the sample starters for a sample', () => {
        const source = panelFor(first('x: s("bd*4").bank("RolandTR909")')).find((g) => g.group === 'source')!
        expect(source.items.map((v) => v.fn)).toEqual(['speed', 'begin', 'end'])
    })

    it('finds a control written with a synonym', () => {
        const filter = panelFor(first('x: note("c").cutoff(900)')).find((g) => g.group === 'filter')!
        expect(filter.items[0]).toMatchObject({ fn: 'lpf', state: 'number', value: 900 })
    })

    it('starts a faint knob at its initial value', () => {
        const delay = panelFor(first(BASS)).find((g) => g.group === 'effects')!.items[0]
        expect(delay).toMatchObject({ value: 0.25, min: 0, max: 1, text: 'off' })
    })
})

describe('volumeOf', () => {
    it('reads the gain that is in the code', () => {
        expect(volumeOf(first(BASS))).toMatchObject({ fn: 'gain', state: 'number', value: 0.6 })
    })

    it('is faint at the default when there is none', () => {
        expect(volumeOf(first('x: note("c")'))).toMatchObject({ fn: 'gain', state: 'faint', value: 0.8, max: 1.5 })
    })
})

describe('panOf', () => {
    it('reads the pan that is in the code', () => {
        expect(panOf(first('x: note("c").pan(slider(0.2, 0, 1))'))).toMatchObject({ fn: 'pan', state: 'live', value: 0.2 })
        expect(panOf(first(BASS))).toMatchObject({ fn: 'pan', state: 'locked', text: 'in code' })
    })

    it('is faint in the middle when there is none', () => {
        expect(panOf(first('x: note("c")'))).toMatchObject({ fn: 'pan', state: 'faint', value: 0.5, min: 0, max: 1 })
    })
})

describe('callFor', () => {
    it('finds the call for a control by any of its names', () => {
        expect(callFor(first('x: note("c").resonance(9)'), 'lpq')?.name).toBe('resonance')
        expect(callFor(first('x: note("c")'), 'lpq')).toBeUndefined()
    })
})
