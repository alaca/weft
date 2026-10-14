import { describe, expect, it } from 'vitest'
import { clearHits, copyHits, copyNotes, noteKey, pasteHits, pasteNotes } from '../../src/song/clip'
import type { GridRow } from '../../src/song/grid'
import { moveNotes, type Note } from '../../src/song/notes'

const bar1: Note[] = [
    { start: 0, length: 2, midi: 48 },
    { start: 4, length: 1, midi: 52, level: 0.6 },
    { start: 8, length: 4, midi: 55 },
]

describe('notes that are copied', () => {
    it('are kept at their place within the bar, and go into another bar the same way', () => {
        const clip = copyNotes(bar1, new Set(bar1.slice(0, 2).map(noteKey)), 16, 'lead')!
        expect(clip).toMatchObject({ kind: 'notes', from: { id: 'lead', bar: 0 }, bars: 1 })
        const pasted = pasteNotes(bar1, clip as any, 1, 32, 16)!
        expect(pasted.added).toEqual([
            { start: 16, midi: 48 },
            { start: 20, midi: 52 },
        ])
        expect(pasted.notes.find((note) => note.start === 20)?.level).toBe(0.6)
    })

    it('fit a pattern with another number of steps, and are left out where they would lie over a note or past the end', () => {
        const clip = copyNotes(bar1, new Set(bar1.map(noteKey)), 16, 'lead')!
        expect(pasteNotes([], clip as any, 0, 8, 8)!.notes).toEqual([
            { start: 0, length: 1, midi: 48 },
            { start: 2, length: 1, midi: 52, level: 0.6 },
            { start: 4, length: 2, midi: 55 },
        ])
        expect(pasteNotes(bar1, clip as any, 0, 16, 16)).toBeNull()
        expect(pasteNotes([], clip as any, 1, 16, 16)).toBeNull()
    })

    it('move together, and not at all when one of them would leave the pattern or lie over a note', () => {
        const refs = bar1.slice(0, 2)
        expect(moveNotes(bar1, refs, 2, (midi) => midi + 1, 16)?.map((note) => [note.start, note.midi])).toEqual([
            [2, 49],
            [6, 53],
            [8, 55],
        ])
        expect(moveNotes(bar1, refs, -1, (midi) => midi, 16)).toBeNull()
        expect(moveNotes(bar1, [bar1[1]], 4, (midi) => 55, 16)).toBeNull()
    })
})

describe('hits of a drum grid that are copied', () => {
    const rows: GridRow[] = [
        { sound: 'bd', steps: [true, false, false, false, true, false, false, false] },
        { sound: 'hh', steps: [false, false, true, false, false, false, true, false], accents: [false, false, true, false, false, false, false, false], lanes: { pan: [0.5, 0.5, 0.2, 0.5, 0.5, 0.5, 0.8, 0.5] } },
    ]

    it('go into another bar with what each had of its own, and a sound the grid lacks gets a row', () => {
        const clip = copyHits(rows, [{ sound: 'hh', step: 2 }, { sound: 'hh', step: 3 }, { sound: 'bd', step: 0 }], 8, 'drums')!
        expect(clip).toMatchObject({ kind: 'hits', from: { id: 'drums', bar: 0 }, bars: 1 })
        const pasted = pasteHits([{ sound: 'sd', steps: Array(16).fill(false) }], clip as any, 1, 16, 8)!
        expect(pasted.added).toEqual([
            { sound: 'bd', step: 8 },
            { sound: 'hh', step: 10 },
        ])
        const hh = pasted.rows.find((row) => row.sound === 'hh')!
        expect(hh.steps[10]).toBe(true)
        expect(hh.accents?.[10]).toBe(true)
        expect(hh.lanes?.pan[10]).toBe(0.2)
        expect(hh.lanes?.pan[11]).toBe(0.5)
    })

    it('are taken out, and nothing changes where there was none', () => {
        const cleared = clearHits(rows, [{ sound: 'hh', step: 2 }, { sound: 'bd', step: 1 }])!
        expect(cleared[1].steps[2]).toBe(false)
        expect(cleared[1].accents?.[2]).toBe(false)
        expect(clearHits(rows, [{ sound: 'bd', step: 1 }])).toBeNull()
    })
})
