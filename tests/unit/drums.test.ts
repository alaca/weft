import { describe, expect, it } from 'vitest'
import { drumChoices, drumLabel } from '../../src/controls/drums'

describe('drums', () => {
    it('names the usual drum sounds in plain words', () => {
        expect(drumLabel('bd')).toBe('Kick')
        expect(drumLabel('oh')).toBe('Open hat')
        expect(drumLabel('zap')).toBe('zap')
    })

    it('offers the kit\'s sounds that are not used yet, usual drums first', () => {
        const choices = drumChoices(['rd', 'bd', 'zap', 'hh', 'sd'], ['bd'])
        expect(choices.map((c) => c.sound)).toEqual(['sd', 'hh', 'rd', 'zap'])
        expect(choices[0]).toEqual({ sound: 'sd', label: 'Snare' })
    })

    it('falls back to the usual drums when the kit is unknown', () => {
        const choices = drumChoices([], ['bd', 'hh'])
        expect(choices.map((c) => c.sound)).toEqual(['sd', 'cp', 'rim', 'oh', 'lt', 'ht', 'cr', 'rd'])
    })
})
