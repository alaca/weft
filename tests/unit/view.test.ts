import { describe as group, expect, it } from 'vitest'
import { describe, noteName } from '../../src/song/view'
import type { PatternEvent } from '../../src/song/types'

const drum = (start: number, sound: string): PatternEvent => ({ start, length: 1 / 16, sound, midi: null })
const note = (start: number, length: number, midi: number): PatternEvent => ({ start, length, sound: 'sawtooth', midi })

group('describe', () => {
    it('is empty when there is nothing to draw', () => {
        expect(describe([])).toEqual({ kind: 'empty' })
        expect(describe([{ start: 0, length: 1, sound: null, midi: null }])).toEqual({ kind: 'empty' })
    })

    it('draws sounds without pitch as rows of 16 steps, in order of first appearance', () => {
        const view = describe([drum(0, 'bd'), drum(0, 'hh'), drum(0.25, 'cp'), drum(0.5, 'bd')])
        expect(view.kind).toBe('steps')
        if (view.kind !== 'steps') return
        expect(view.rows.map((r) => r.name)).toEqual(['bd', 'hh', 'cp'])
        expect(view.rows[0].steps).toHaveLength(16)
        expect(view.rows[0].steps.flatMap((on, i) => (on ? [i] : []))).toEqual([0, 8])
        expect(view.rows[2].steps.flatMap((on, i) => (on ? [i] : []))).toEqual([4])
    })

    it('puts an event that is off the grid in the step its start falls in', () => {
        const view = describe([drum(1 / 3, 'hh'), drum(0.999, 'hh')])
        if (view.kind !== 'steps') throw new Error('expected steps')
        expect(view.rows[0].steps.flatMap((on, i) => (on ? [i] : []))).toEqual([5, 15])
    })

    it('draws pitched events as notes with the range they span', () => {
        const view = describe([note(0, 0.125, 38), note(0.375, 0.125, 41), note(0.75, 0.125, 33)])
        expect(view).toEqual({
            kind: 'notes',
            lowest: 33,
            highest: 41,
            notes: [
                { start: 0, length: 0.125, midi: 38 },
                { start: 0.375, length: 0.125, midi: 41 },
                { start: 0.75, length: 0.125, midi: 33 },
            ],
        })
    })

    it('clips a note that runs past the end of the cycle', () => {
        const view = describe([note(0.75, 0.5, 60)])
        if (view.kind !== 'notes') throw new Error('expected notes')
        expect(view.notes[0].length).toBe(0.25)
    })

    it('prefers notes when a pattern has both pitched and unpitched events', () => {
        expect(describe([drum(0, 'bd'), note(0.5, 0.25, 60)]).kind).toBe('notes')
    })
})

group('noteName', () => {
    it('names a midi number', () => {
        expect(noteName(48)).toBe('c3')
        expect(noteName(33)).toBe('a1')
        expect(noteName(42)).toBe('f#2')
    })
})
