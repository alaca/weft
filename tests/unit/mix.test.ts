import { describe, expect, it } from 'vitest'
import { DEFAULT_MIX, decibels, fitMix, isUsualMix, meterShare, panText, readMix, settle, shareOf, toneText, volumeText } from '../../src/library/mix'

describe('the settings of the mixer', () => {
    it('start where nothing is changed', () => {
        expect(readMix(null)).toEqual({ volume: 1, pan: 0, low: 0, mid: 0, high: 0, limit: false })
        expect(isUsualMix(readMix(null))).toBe(true)
    })

    it('are kept within what a control can be set to', () => {
        expect(fitMix({ volume: 9, pan: -3, low: 40, mid: -40, high: 2.26, limit: true })).toEqual({ volume: 1.5, pan: -1, low: 12, mid: -12, high: 2.5, limit: true })
        expect(fitMix({ volume: -1, pan: 0.337 })).toMatchObject({ volume: 0, pan: 0.34 })
        expect(Object.is(fitMix({ pan: -0.001 }).pan, 0)).toBe(true)
    })

    it('come back as the usual wherever what was kept cannot be a setting', () => {
        expect(readMix('not json')).toEqual(DEFAULT_MIX)
        expect(readMix('{"volume":"loud","pan":null,"low":3,"limit":"yes"}')).toEqual({ ...DEFAULT_MIX, low: 3 })
        expect(readMix('{"volume":0.85,"limit":true}')).toEqual({ ...DEFAULT_MIX, volume: 0.85, limit: true })
        expect(isUsualMix({ ...DEFAULT_MIX, limit: true })).toBe(false)
    })

    it('are told in words', () => {
        expect(volumeText(0.85)).toBe('85%')
        expect([panText(0), panText(-0.5), panText(1)]).toEqual(['Centre', '50% left', '100% right'])
        expect([toneText(0), toneText(2.5), toneText(-12)]).toEqual(['0 dB', '+2.5 dB', '-12 dB'])
    })
})

describe('a meter', () => {
    it('reads loudness in decibels, from far below what is heard to a little over the loudest', () => {
        expect(decibels(1)).toBe(0)
        expect(decibels(0.5)).toBeCloseTo(-6.02, 2)
        expect(decibels(0)).toBe(-Infinity)
        expect(meterShare(0)).toBe(0)
        expect(meterShare(0.001)).toBe(0)
        expect(meterShare(1)).toBeCloseTo(48 / 54)
        expect(meterShare(4)).toBe(1)
        expect(shareOf(-12)).toBeCloseTo(36 / 54)
    })

    it('rises at once and falls back slowly', () => {
        expect(settle(0.2, 0.8, 0.016)).toBe(0.8)
        expect(settle(0.8, 0, 0.1)).toBeCloseTo(0.71)
        expect(settle(0.05, 0, 1)).toBe(0)
        expect(settle(0.5, 0.45, 0.5)).toBe(0.45)
    })
})
