import { describe, expect, it } from 'vitest'
import { firstMotion, motionText, readMotion } from '../../src/controls/motion'
import { callFor, panelFor } from '../../src/controls/views'
import { analyze } from '../../src/song/analyze'

const blockOf = (code: string) => analyze(code).patterns[0]
const motionOf = (code: string, fn = 'lpf') => readMotion(callFor(blockOf(code), fn))
const write = (value: number) => String(Math.round(value))

describe('readMotion', () => {
    it('reads a value that goes back and forth, or one way, over some bars', () => {
        expect(motionOf('x: note("c").lpf(sine.range(500, 2600).slow(16))')).toEqual({ shape: 'sine', from: 500, to: 2600, bars: 16 })
        expect(motionOf('x: note("c").lpf(saw.range(300, 9000).slow(4))')).toEqual({ shape: 'saw', from: 300, to: 9000, bars: 4 })
        expect(motionOf('x: note("c").lpf(sine.range(200, 800))')).toEqual({ shape: 'sine', from: 200, to: 800, bars: 1 })
    })

    it('reads a fall as one way with the ends turned round', () => {
        expect(motionOf('x: note("c").lpf(isaw.range(200, 4000).slow(8))')).toEqual({ shape: 'saw', from: 4000, to: 200, bars: 8 })
    })

    it('leaves alone what is not written that way', () => {
        expect(motionOf('x: note("c").lpf(slider(800, 100, 8000))')).toBeNull()
        expect(motionOf('x: note("c").lpf(perlin.range(200, 800).slow(4))')).toBeNull()
        expect(motionOf('x: note("c").lpf(sine.range(200, 800).fast(2))')).toBeNull()
        expect(motionOf('x: note("c").lpf(sine.slow(4))')).toBeNull()
        expect(motionOf('x: note("c").lpf(sine.range(lo, 800))')).toBeNull()
    })
})

describe('writing a motion', () => {
    it('writes it the way it is read', () => {
        expect(motionText({ shape: 'sine', from: 500, to: 2600, bars: 16 }, write)).toBe('sine.range(500, 2600).slow(16)')
        expect(motionText({ shape: 'saw', from: 4000, to: 200, bars: 1 }, write)).toBe('saw.range(4000, 200)')
    })

    it('starts from a quarter of the way to where the knob stood', () => {
        expect(firstMotion(1200, 100, 8000)).toEqual({ shape: 'sine', from: 375, to: 1200, bars: 4 })
        expect(firstMotion(0, 0, 1)).toEqual({ shape: 'sine', from: 0.125, to: 0.5, bars: 4 })
    })
})

describe('a moving control in the panel', () => {
    it('is shown as moving, with both its ends', () => {
        const filter = panelFor(blockOf('x: note("c").s("sawtooth").lpf(sine.range(500, 2600).slow(16))')).find((group) => group.group === 'filter')!
        expect(filter.items[0]).toMatchObject({ fn: 'lpf', state: 'moving', text: '500 to 2600 Hz', motion: { shape: 'sine', bars: 16 } })
    })
})
