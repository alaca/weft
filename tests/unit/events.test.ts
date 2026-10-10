import { describe, expect, it } from 'vitest'
import { noteNameToMidi, toEvents } from '../../src/engine/events'

const hap = (begin: number, end: number, value: unknown, onset = true) => ({
    whole: { begin: { valueOf: () => begin }, end: { valueOf: () => end } },
    hasOnset: () => onset,
    value,
})

describe('noteNameToMidi', () => {
    it('reads note names the way Strudel does', () => {
        expect(noteNameToMidi('c3')).toBe(48)
        expect(noteNameToMidi('a1')).toBe(33)
        expect(noteNameToMidi('f#2')).toBe(42)
        expect(noteNameToMidi('eb4')).toBe(63)
        expect(noteNameToMidi('C')).toBe(48)
    })

    it('returns null for anything that is not a note', () => {
        expect(noteNameToMidi('bd')).toBeNull()
        expect(noteNameToMidi('')).toBeNull()
    })
})

describe('toEvents', () => {
    it('keeps events that begin inside the cycle, relative to its start', () => {
        const events = toEvents([hap(3, 3.25, { s: 'bd' }), hap(3.5, 3.75, { s: 'cp' }), hap(4, 4.25, { s: 'bd' })], 3)
        expect(events).toEqual([
            { start: 0, length: 0.25, sound: 'bd', midi: null },
            { start: 0.5, length: 0.25, sound: 'cp', midi: null },
        ])
    })

    it('leaves out fragments that have no onset', () => {
        expect(toEvents([hap(0, 2, { s: 'pad' }, false)], 0)).toEqual([])
    })

    it('leaves out events with no whole', () => {
        expect(toEvents([{ hasOnset: () => true, value: { s: 'bd' } }], 0)).toEqual([])
    })

    it('reads pitch from a note name, a note number or a frequency', () => {
        const events = toEvents([hap(0, 0.5, { note: 'd2', s: 'sawtooth' }), hap(0.5, 0.75, { note: 50 }), hap(0.75, 1, { freq: 440 })], 0)
        expect(events.map((e) => e.midi)).toEqual([38, 50, 69])
        expect(events[0].sound).toBe('sawtooth')
    })

    it('keeps the order Strudel reports, which for layers is the order they are written', () => {
        const events = toEvents([hap(0.5, 1, { s: 'bd' }), hap(0, 0.5, { s: 'hh' })], 0)
        expect(events.map((e) => e.sound)).toEqual(['bd', 'hh'])
    })
})
