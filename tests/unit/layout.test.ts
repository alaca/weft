import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT, fitShare, fitWidth, isUsual, readLayout, usualCode } from '../../src/library/layout'

describe('readLayout', () => {
    it('gives the usual layout when nothing was kept, or what was kept cannot be read', () => {
        expect(readLayout(null)).toEqual(DEFAULT_LAYOUT)
        expect(readLayout('{')).toEqual(DEFAULT_LAYOUT)
    })

    it('keeps what can be a layout and replaces the rest', () => {
        expect(readLayout(JSON.stringify({ view: 'code', sounds: true, mixer: false, wave: false, song: 'no', soundsWidth: 301.6, codeWidth: -5 }))).toEqual({
            view: 'code',
            sounds: true,
            jams: false,
            mixer: false,
            wave: false,
            song: true,
            soundsWidth: 302,
            codeWidth: null,
            soundsShare: null,
            folded: [],
        })
        expect(readLayout(JSON.stringify({ jams: true, soundsShare: 0.95 }))).toMatchObject({ jams: true, soundsShare: 0.75 })
        expect(readLayout(JSON.stringify({ jams: 'yes', soundsShare: 'half' }))).toMatchObject({ jams: false, soundsShare: null })
        expect([readLayout(JSON.stringify({ mixer: false })).mixer, readLayout(JSON.stringify({ mixer: 1 })).mixer, readLayout(JSON.stringify({ sounds: 0 })).sounds]).toEqual([false, true, true])
        expect(readLayout(JSON.stringify({ view: 'sideways' })).view).toBe('both')
        expect(readLayout(JSON.stringify({ folded: ['jams', 'nothing', 'mixer'] })).folded).toEqual(['mixer', 'jams'])
        expect(readLayout(JSON.stringify({ folded: 'all' })).folded).toEqual([])
        expect(isUsual({ ...DEFAULT_LAYOUT, folded: [] })).toBe(true)
        expect(isUsual({ ...DEFAULT_LAYOUT, folded: ['sounds'] })).toBe(false)
    })
})

describe('isUsual', () => {
    it('is true only when nothing was changed', () => {
        expect(isUsual(DEFAULT_LAYOUT)).toBe(true)
        expect(isUsual({ ...DEFAULT_LAYOUT, codeWidth: 500 })).toBe(false)
        expect(isUsual({ ...DEFAULT_LAYOUT, wave: false })).toBe(false)
    })
})

describe('fitShare', () => {
    it('keeps the sounds between a fifth and three quarters of the left column', () => {
        expect(fitShare(0.5)).toBe(0.5)
        expect(fitShare(0.05)).toBe(0.2)
        expect(fitShare(0.9)).toBe(0.75)
        expect(fitShare(0.33333)).toBe(0.333)
    })
})

describe('widths', () => {
    it('gives the code column two fifths of the window, and never too little', () => {
        expect(usualCode(1440)).toBe(432)
        expect(usualCode(900)).toBe(380)
    })

    it('lets a column be dragged between its least width and what the others leave', () => {
        expect(fitWidth(500, 260, 1440, 965)).toBe(475)
        expect(fitWidth(100, 260, 1440, 965)).toBe(260)
        expect(fitWidth(400, 260, 1440, 965)).toBe(400)
        expect(fitWidth(900, 320, 1000, 900)).toBe(320)
    })
})
