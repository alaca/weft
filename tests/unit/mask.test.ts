import { describe, expect, it } from 'vitest'
import { maskSliders } from '../../src/engine/mask'

describe('maskSliders', () => {
    it('hides the value of every slider and nothing else', () => {
        expect(maskSliders('a.lpf(slider(1200, 200, 4000)).gain(slider(.5)).lpq(8)')).toBe('a.lpf(slider(#, 200, 4000)).gain(slider(#)).lpq(8)')
    })

    it('hides negative and spaced values', () => {
        expect(maskSliders('slider( -12.5, -24, 24)')).toBe('slider(#, -24, 24)')
    })

    it('makes two texts equal when only slider values differ', () => {
        expect(maskSliders('x.room(slider(0.4, 0, 1))')).toBe(maskSliders('x.room(slider(0.75, 0, 1))'))
        expect(maskSliders('x.room(slider(0.4, 0, 1))')).not.toBe(maskSliders('x.room(slider(0.4, 0, 2))'))
    })
})
