import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { gridFromEvents, paintSteps, parseGrid, readGrid, removeRow, resample, resize, sourceText, toggleAccent, toggleStep } from '../../src/song/grid'

const first = (code: string) => analyze(code).patterns[0]
const hits = (steps: boolean[]) => steps.flatMap((on, i) => (on ? [i] : []))

const GRID = 'drums: s(`\n  bd ~  ~  ~    bd ~  ~  ~    bd ~  ~  ~    bd ~  ~  ~ ,\n  ~  ~  ~  ~    cp ~  ~  ~    ~  ~  ~  ~    cp ~  ~  ~\n`)\n  .bank("RolandTR909")\n'

describe('parseGrid', () => {
    it('reads rows of steps', () => {
        const rows = parseGrid('bd ~ ~ ~ bd ~ ~ ~, ~ ~ cp ~ ~ ~ cp ~')!
        expect(rows.map((r) => r.sound)).toEqual(['bd', 'cp'])
        expect(hits(rows[0].steps)).toEqual([0, 4])
        expect(hits(rows[1].steps)).toEqual([2, 6])
    })

    it('accepts line breaks and a sample number', () => {
        const rows = parseGrid('\n  hh:2 ~ hh:2 ~ ,\n  ~ bd ~ ~\n')!
        expect(rows.map((r) => r.sound)).toEqual(['hh:2', 'bd'])
    })

    it('refuses anything a grid cannot hold', () => {
        expect(parseGrid('bd*4, hh*8')).toBeNull()
        expect(parseGrid('bd ~ ~ ~, hh ~')).toBeNull()
        expect(parseGrid('bd hh ~ ~')).toBeNull()
        expect(parseGrid('~ ~ ~ ~')).toBeNull()
        expect(parseGrid('bd ~ ~')).toBeNull()
        expect(parseGrid('bd')).toBeNull()
        expect(parseGrid('<bd sd> ~ ~ ~')).toBeNull()
        expect(parseGrid('')).toBeNull()
    })
})

describe('readGrid', () => {
    it('reads the grid of a pattern and where its text is', () => {
        const source = readGrid(first(GRID))!
        expect(source.grid).toMatchObject({ steps: 16, cycles: 1, perCycle: 16 })
        expect(source.grid.rows.map((r) => r.sound)).toEqual(['bd', 'cp'])
        expect(GRID.slice(source.from, source.to).startsWith('`\n  bd')).toBe(true)
        expect(source.slow).toBeNull()
    })

    it('reads the length from slow', () => {
        const code = 'x: s("bd ~ ~ ~ ~ ~ ~ ~").slow(2)'
        const source = readGrid(first(code))!
        expect(source.grid).toMatchObject({ steps: 8, cycles: 2, perCycle: 4 })
        expect(source.slow?.name).toBe('slow')
    })

    it('is not a grid when the text is compact, the source is not a sound, or slow is not a whole number', () => {
        expect(readGrid(first('x: s("bd*4, hh*8")'))).toBeNull()
        expect(readGrid(first('x: note("c ~ ~ ~")'))).toBeNull()
        expect(readGrid(first('x: s("bd ~ ~ ~").slow(1.5)'))).toBeNull()
    })
})

describe('sourceText', () => {
    it('gives the text of a sound source and nothing for other sources', () => {
        expect(sourceText(first('x: s("bd*4, hh*8").bank("a")'))?.text).toBe('bd*4, hh*8')
        expect(sourceText(first('x: note("c e")'))).toBeNull()
        expect(sourceText(first('x: s("bd", "hh")'))).toBeNull()
    })
})

describe('changing a grid', () => {
    const rows = parseGrid('bd ~ ~ ~, ~ ~ cp ~')!

    it('toggles a step on and off', () => {
        const on = toggleStep(rows, 'bd', 2, 4)
        expect(hits(on[0].steps)).toEqual([0, 2])
        expect(toggleStep(on, 'bd', 2, 4)).toEqual(rows)
    })

    it('adds a row for a sound that has none', () => {
        const next = toggleStep(rows, 'hh', 1, 4)
        expect(next.map((r) => r.sound)).toEqual(['bd', 'cp', 'hh'])
        expect(hits(next[2].steps)).toEqual([1])
    })

    it('keeps a row when its last hit is removed', () => {
        const next = toggleStep(rows, 'cp', 2, 4)
        expect(next.map((r) => r.sound)).toEqual(['bd', 'cp'])
        expect(hits(next[1].steps)).toEqual([])
    })

    it('removes a row', () => {
        expect(removeRow(rows, 'bd').map((r) => r.sound)).toEqual(['cp'])
    })

    it('puts in every step of a run, whichever end it is given from, and leaves the rest', () => {
        const wide = parseGrid('bd ~ ~ ~ ~ ~ bd ~, ~ ~ cp ~ ~ ~ ~ ~')!
        expect(hits(paintSteps(wide, 'bd', 4, 2, true, 8)![0].steps)).toEqual([0, 2, 3, 4, 6])
        expect(paintSteps(wide, 'bd', 2, 4, true, 8)![1]).toEqual(wide[1])
        expect(paintSteps(wide, 'bd', 0, 0, true, 8)).toBeNull()
    })

    it('takes out every step of a run, and what made a hit louder goes with it', () => {
        const loud = toggleAccent(parseGrid('bd bd bd ~, ~ ~ cp ~')!, 'bd', 1, 4)
        const next = paintSteps(loud, 'bd', 1, 3, false, 4)!
        expect(hits(next[0].steps)).toEqual([0])
        expect(hits(next[0].accents!)).toEqual([])
        expect(paintSteps(next, 'bd', 1, 3, false, 4)).toBeNull()
    })

    it('repeats the steps when the pattern gets longer and cuts them when shorter', () => {
        const grid = { rows, steps: 4, cycles: 1, perCycle: 4 }
        const longer = resize(grid, 2)
        expect(hits(longer[0].steps)).toEqual([0, 4])
        expect(longer[0].steps).toHaveLength(8)
        const shorter = resize({ rows: longer, steps: 8, cycles: 2, perCycle: 4 }, 1)
        expect(shorter).toEqual(rows)
    })

    it('doubles the steps and halves them again', () => {
        const grid = { rows, steps: 4, cycles: 1, perCycle: 4 }
        const fine = resample(grid, 8)!
        expect(hits(fine[0].steps)).toEqual([0])
        expect(hits(fine[1].steps)).toEqual([4])
        expect(resample({ rows: fine, steps: 8, cycles: 1, perCycle: 8 }, 4)).toEqual(rows)
    })

    it('will not halve the steps when a hit would be lost', () => {
        const odd = parseGrid('bd bd ~ ~ ~ ~ ~ ~')!
        expect(resample({ rows: odd, steps: 8, cycles: 1, perCycle: 8 }, 4)).toBeNull()
    })

    it('goes between fours and threes when every hit is on a beat, keeping louder hits', () => {
        const beats = [{ sound: 'bd', steps: parseGrid('bd ~ ~ ~   bd ~ ~ ~   bd ~ ~ ~   bd ~ ~ ~')![0].steps, accents: [true, ...Array<boolean>(15).fill(false)] }]
        const threes = resample({ rows: beats, steps: 16, cycles: 1, perCycle: 16 }, 12)!
        expect(threes[0].steps).toHaveLength(12)
        expect(hits(threes[0].steps)).toEqual([0, 3, 6, 9])
        expect(hits(threes[0].accents!)).toEqual([0])
        expect(hits(resample({ rows: threes, steps: 12, cycles: 1, perCycle: 12 }, 24)![0].steps)).toEqual([0, 6, 12, 18])
        expect(hits(resample({ rows: threes, steps: 12, cycles: 1, perCycle: 12 }, 16)![0].steps)).toEqual([0, 4, 8, 12])
    })

    it('will not go to threes when a hit sits between the beats', () => {
        const off = parseGrid('bd ~ bd ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~')!
        expect(resample({ rows: off, steps: 16, cycles: 1, perCycle: 16 }, 12)).toBeNull()
    })
})

describe('gridFromEvents', () => {
    const cycle = [
        { start: 0, value: 'bd' },
        { start: 0.25, value: 'bd' },
        { start: 0.25, value: 'cp' },
        { start: 0.5, value: 'bd' },
        { start: 0.75, value: 'bd' },
        { start: 0.75, value: 'cp' },
    ]

    it('turns events that repeat every cycle into 16 steps', () => {
        const rows = gridFromEvents([cycle, cycle, cycle, cycle])!
        expect(rows.map((r) => r.sound)).toEqual(['bd', 'cp'])
        expect(hits(rows[0].steps)).toEqual([0, 4, 8, 12])
        expect(hits(rows[1].steps)).toEqual([4, 12])
        expect(rows[0].steps).toHaveLength(16)
    })

    it('uses 32 steps when 16 are too coarse', () => {
        const fine = [{ start: 1 / 32, value: 'hh' }]
        expect(gridFromEvents([fine, fine])![0].steps).toHaveLength(32)
    })

    it('refuses events that change from cycle to cycle, fall off the grid, or are not sound names', () => {
        expect(gridFromEvents([cycle, cycle.slice(1)])).toBeNull()
        const off = [{ start: 1 / 5, value: 'hh' }]
        expect(gridFromEvents([off, off])).toBeNull()
        const odd = [{ start: 0, value: ['hh', 2] }]
        expect(gridFromEvents([odd, odd])).toBeNull()
    })

    it('gives no rows for silence', () => {
        expect(gridFromEvents([[], []])).toEqual([])
    })

    it('puts hits counted in threes on twelve steps, and finer ones on twenty-four', () => {
        const threes = [0, 1 / 3, 2 / 3].map((start) => ({ start, value: 'hh' }))
        expect(gridFromEvents([threes, threes])!.map((row) => hits(row.steps))).toEqual([[0, 4, 8]])
        expect(gridFromEvents([threes, threes])![0].steps).toHaveLength(12)
        const fine = [0, 1 / 24].map((start) => ({ start, value: 'hh' }))
        expect(gridFromEvents([fine, fine])![0].steps).toHaveLength(24)
    })
})
