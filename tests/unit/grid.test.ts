import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { applyEdits } from '../../src/song/edits'
import { formatGrid, gridEdits, gridFromEvents, parseGrid, readGrid, removeRow, resample, resize, sourceText, toggleStep } from '../../src/song/grid'

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

describe('formatGrid', () => {
    it('writes one aligned line per row with steps grouped in fours', () => {
        const rows = [
            { sound: 'bd', steps: [true, false, false, false, true, false, false, false] },
            { sound: 'rim', steps: [false, false, true, false, false, false, true, false] },
        ]
        expect(formatGrid(rows)).toBe('`\n  bd  ~   ~   ~     bd  ~   ~   ~ ,\n  ~   ~   rim ~     ~   ~   rim ~\n`')
    })

    it('reads back what it wrote', () => {
        const rows = parseGrid('bd ~ ~ ~ bd ~ ~ ~, ~ ~ cp ~ ~ ~ cp ~')!
        expect(parseGrid(formatGrid(rows).slice(1, -1))).toEqual(rows)
    })

    it('writes a single rest when there are no rows', () => {
        expect(formatGrid([])).toBe('"~"')
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

    it('drops a row when its last hit is removed', () => {
        expect(toggleStep(rows, 'cp', 2, 4).map((r) => r.sound)).toEqual(['bd'])
    })

    it('removes a row', () => {
        expect(removeRow(rows, 'bd').map((r) => r.sound)).toEqual(['cp'])
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
        const off = [{ start: 1 / 3, value: 'hh' }]
        expect(gridFromEvents([off, off])).toBeNull()
        const odd = [{ start: 0, value: ['hh', 2] }]
        expect(gridFromEvents([odd, odd])).toBeNull()
    })

    it('gives no rows for silence', () => {
        expect(gridFromEvents([[], []])).toEqual([])
    })
})

describe('gridEdits', () => {
    it('rewrites only the grid text when the length does not change', () => {
        const block = first(GRID)
        const source = readGrid(block)!
        const rows = toggleStep(source.grid.rows, 'cp', 0, 16)
        const next = applyEdits(GRID, gridEdits(block, source, rows, 1))
        expect(next).toContain('  cp ~  ~  ~    cp ~  ~  ~    ~  ~  ~  ~    cp ~  ~  ~\n`)\n  .bank("RolandTR909")')
        expect(readGrid(first(next))!.grid.rows[1].steps.filter(Boolean)).toHaveLength(3)
    })

    it('adds, changes and removes slow with the length', () => {
        const block = first(GRID)
        const source = readGrid(block)!
        const two = applyEdits(GRID, gridEdits(block, source, resize(source.grid, 2), 2))
        expect(two).toContain('`).slow(2)\n  .bank("RolandTR909")')
        expect(readGrid(first(two))!.grid).toMatchObject({ steps: 32, cycles: 2, perCycle: 16 })

        const blockTwo = first(two)
        const sourceTwo = readGrid(blockTwo)!
        const four = applyEdits(two, gridEdits(blockTwo, sourceTwo, resize(sourceTwo.grid, 4), 4))
        expect(four).toContain('`).slow(4)\n')

        const blockFour = first(four)
        const sourceFour = readGrid(blockFour)!
        const one = applyEdits(four, gridEdits(blockFour, sourceFour, resize(sourceFour.grid, 1), 1))
        expect(one).toBe(GRID)
    })

    it('turns a compact string into a grid in place', () => {
        const code = 'drums: s("bd*4, [~ cp]*2")\n  .bank("RolandTR909")\n'
        const block = first(code)
        const text = sourceText(block)!
        const rows = parseGrid('bd ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~, ~ ~ ~ ~ cp ~ ~ ~ ~ ~ ~ ~ cp ~ ~ ~')!
        const source = { grid: { rows, steps: 16, cycles: 1, perCycle: 16 }, from: text.from, to: text.to, slow: null }
        expect(applyEdits(code, gridEdits(block, source, rows, 1))).toBe(GRID)
    })
})
