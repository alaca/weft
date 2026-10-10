import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT, fitWidth, isUsual, readLayout, usualCode } from '../../src/library/layout'

describe('readLayout', () => {
    it('gives the usual layout when nothing was kept, or what was kept cannot be read', () => {
        expect(readLayout(null)).toEqual(DEFAULT_LAYOUT)
        expect(readLayout('{')).toEqual(DEFAULT_LAYOUT)
    })

    it('keeps what can be a layout and replaces the rest', () => {
        expect(readLayout(JSON.stringify({ view: 'code', sounds: true, wave: false, song: 'no', soundsWidth: 301.6, codeWidth: -5 }))).toEqual({
            view: 'code',
            sounds: true,
            wave: false,
            song: true,
            soundsWidth: 302,
            codeWidth: null,
        })
        expect(readLayout(JSON.stringify({ view: 'sideways' })).view).toBe('both')
    })
})

describe('isUsual', () => {
    it('is true only when nothing was changed', () => {
        expect(isUsual(DEFAULT_LAYOUT)).toBe(true)
        expect(isUsual({ ...DEFAULT_LAYOUT, codeWidth: 500 })).toBe(false)
        expect(isUsual({ ...DEFAULT_LAYOUT, wave: false })).toBe(false)
    })
})

describe('widths', () => {
    it('gives the code column two fifths of the window, and never too little', () => {
        expect(usualCode(1440)).toBe(605)
        expect(usualCode(900)).toBe(420)
    })

    it('lets a column be dragged between its least width and what the others leave', () => {
        expect(fitWidth(500, 260, 1440, 965)).toBe(475)
        expect(fitWidth(100, 260, 1440, 965)).toBe(260)
        expect(fitWidth(400, 260, 1440, 965)).toBe(400)
        expect(fitWidth(900, 320, 1000, 900)).toBe(320)
    })
})
