import { describe, expect, it } from 'vitest'
import { DEMOS } from '../../src/library/demos'
import { analyze } from '../../src/song/analyze'
import { readArrangement, songLength } from '../../src/song/arrange'
import { barsText } from '../../src/song/bars'
import { readKit } from '../../src/song/kit'
import { readNotes } from '../../src/song/notes'

const KITS: Record<string, string[]> = {
    RolandTR909: ['bd', 'cp', 'cr', 'hh', 'ht', 'lt', 'mt', 'oh', 'rd', 'rim', 'sd'],
    LinnDrum: ['bd', 'cb', 'cp', 'cr', 'hh', 'ht', 'lt', 'mt', 'oh', 'perc', 'rd', 'rim', 'sd', 'sh', 'tb'],
    EmuSP12: ['bd', 'cb', 'cp', 'cr', 'hh', 'ht', 'lt', 'misc', 'mt', 'oh', 'perc', 'rd', 'rim', 'sd'],
}

describe('the demo songs', () => {
    it('are eight, each under its own name', () => {
        expect(DEMOS.map((demo) => demo.name)).toEqual(['Glasshouse', 'Low sun', 'Grey area', 'Squelch', 'Spiral', 'Night shift', 'Undertow', 'Slow burn'])
        expect(new Set(DEMOS.map((demo) => demo.id)).size).toBe(DEMOS.length)
    })

    for (const demo of DEMOS) {
        describe(demo.name, () => {
            const song = analyze(demo.code)

            it('is code without an error, with a tempo and patterns under their own names', () => {
                expect(song.error).toBeNull()
                expect(song.tempo?.bpm).toBeGreaterThan(60)
                expect(song.patterns.length).toBeGreaterThanOrEqual(4)
                expect(new Set(song.patterns.map((block) => block.id)).size).toBe(song.patterns.length)
            })

            it('can be changed by clicking: every pattern is a drum kit or a grid of notes', () => {
                for (const block of song.patterns) {
                    const kit = readKit(block)
                    const notes = readNotes(block)
                    expect(kit !== null || notes !== null, block.id).toBe(true)
                    if (kit) {
                        expect(kit.rows.length, block.id).toBeGreaterThan(0)
                        for (const row of kit.rows) expect(KITS[block.soundName ?? ''], `${block.id} ${row.sound}`).toContain(row.sound)
                        expect(kit.steps % 16, block.id).toBe(0)
                    }
                    if (notes) expect(notes.grid.notes.length, block.id).toBeGreaterThan(0)
                    expect(block.soundName, block.id).not.toBeNull()
                }
            })

            it('is arranged as a song of 64 bars, with every arrangement written the way the app writes it', () => {
                expect(songLength(song.patterns, 16)).toBe(64)
                const arranged = song.patterns.flatMap((block) => readArrangement(block) ?? [])
                expect(arranged.length).toBeGreaterThanOrEqual(3)
                for (const arrangement of arranged) {
                    expect(arrangement.bars).toHaveLength(64)
                    expect(barsText(arrangement.bars)).toBe(arrangement.arg.value)
                }
                for (const block of song.patterns) {
                    const last = block.calls[block.calls.length - 1]
                    if (readArrangement(block)) expect(last.name, block.id).toBe('mask')
                }
            })

            it('has its drops where the kick leaves and comes back', () => {
                const bars = (id: string) => readArrangement(song.patterns.find((block) => block.id === id)!)!.bars
                const on = (id: string) => bars(id).flatMap((plays, bar) => (plays ? [bar + 1] : []))
                expect(bars('drums')[31]).toBe(false)
                expect(bars('drums')[32]).toBe(true)
                if (!song.patterns.some((block) => block.id === 'roll')) {
                    expect(bars('drums').slice(28, 33)).toEqual([false, false, false, false, true])
                    return
                }
                expect(on('roll')).toEqual([29, 30, 31, 32, 53, 54, 55, 56])
                expect(on('riser')).toEqual(on('roll'))
                expect(on('crash')).toEqual([33, 57])
                expect(bars('drums').slice(28, 33)).toEqual([true, true, true, false, true])
                if (song.patterns.some((block) => block.id === 'bass')) expect(bars('bass').slice(28, 33)).toEqual([false, false, false, false, true])
            })

            it('has something playing in every bar', () => {
                for (let bar = 0; bar < 64; bar++) {
                    const playing = song.patterns.some((block) => {
                        const bars = readArrangement(block)?.bars
                        return bars ? bars[bar] : true
                    })
                    expect(playing, `bar ${bar + 1}`).toBe(true)
                }
            })
        })
    }
})
