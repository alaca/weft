import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { applyEdits } from '../../src/song/edits'
import { clearSteps, resample, setSteps, stepValues, toggleAccent, toggleStep, type GridRow } from '../../src/song/grid'
import { kitEdits, readKit, stepsText } from '../../src/song/kit'

const song = (hh: string) => `drums: stack(
  s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~"),
  ${hh},
)
  .bank("RolandTR909")
`
const PLAIN = song('s("hh").struct("x x ~ x   x x x x   x x x x   x x x x").pan(slider(0.5, 0, 1))')
const kitOf = (code: string) => readKit(analyze(code).patterns[0])!
const rowsOf = (code: string): GridRow[] => kitOf(code).rows.map(({ block: _, muted: __, ...row }) => row)
const write = (code: string, rows: GridRow[]) => applyEdits(code, kitEdits(code, kitOf(code), rows))
const hh = (code: string) => code.split('\n')[2].trim()

describe('what a step has of its own', () => {
    it('is read from the steps: how many times a hit sounds, and how likely it is to', () => {
        const row = kitOf(song('s("hh").struct("x x*3 ~ x?   x?0.25 x*2?0.5 x x   ~ ~ ~ ~   ~ ~ ~ ~")')).rows[1]
        expect(row.steps.slice(0, 8)).toEqual([true, true, false, true, true, true, true, true])
        expect(row.repeats?.slice(0, 8)).toEqual([1, 3, 1, 1, 1, 2, 1, 1])
        expect(row.chances?.slice(0, 8)).toEqual([1, 1, 1, 0.5, 0.75, 0.5, 1, 1])
        expect(stepsText(row)).toBe('x x*3 ~ x?   x?0.25 x*2? x x   ~ ~ ~ ~   ~ ~ ~ ~')
    })

    it('is not read from steps written another way, which stay for the code', () => {
        const rest = '   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~'
        expect(readKit(analyze(song(`s("hh").struct("x x ~ x${rest}")`)).patterns[0])).not.toBeNull()
        expect(readKit(analyze(song(`s("hh").struct("x!2 ~ x x${rest}")`)).patterns[0])).toBeNull()
        expect(readKit(analyze(song(`s("hh").struct("x*9 ~ x x${rest}")`)).patterns[0])).toBeNull()
    })

    it('a chance and repeats are written into the steps, for hits only', () => {
        let rows = setSteps(rowsOf(PLAIN), 'hh', 'chance', 0, [0.5, 0.75, 0.2, 1])!
        rows = setSteps(rows, 'hh', 'repeats', 15, [3])!
        const next = write(PLAIN, rows)
        expect(hh(next)).toBe('s("hh").struct("x? x?0.25 ~ x   x x x x   x x x x   x x x x*3").pan(slider(0.5, 0, 1)),')
        expect(rowsOf(next)[1]).toEqual(rows[1])
    })

    it('a level for every step is written where the louder hits are, and louder is one of the levels', () => {
        const rows = setSteps(rowsOf(PLAIN), 'hh', 'level', 0, [0.4, 1.5])!
        expect(rows[1].accents?.slice(0, 2)).toEqual([false, true])
        const next = write(PLAIN, rows)
        expect(hh(next)).toContain('.struct("x x ~ x   x x x x   x x x x   x x x x").postgain("0.4 1.5 1 1   1 1 1 1   1 1 1 1   1 1 1 1").pan(')
        const louder = toggleAccent(rowsOf(next), 'hh', 3, 16)
        expect(louder[1].lanes?.postgain[3]).toBe(1.5)
        // Only ordinary and louder hits again: they are the louder hits and nothing more.
        const plain = setSteps(rowsOf(next), 'hh', 'level', 0, [1])!
        expect(rowsOf(write(next, plain))[1]).toEqual({ ...rowsOf(PLAIN)[1], accents: rowsOf(PLAIN)[1].steps.map((_, at) => at === 1) })
    })

    it('a value for every step takes the place of the knob, starting from where the knob stood, and the knob comes back', () => {
        const turned = PLAIN.replace('slider(0.5, 0, 1)', 'slider(0.3, 0, 1)')
        expect(stepValues(rowsOf(turned)[1], 'pan', 0.3)[5]).toBe(0.3)
        const rows = setSteps(rowsOf(turned), 'hh', 'pan', 0, [0.9], 0.3)!
        const next = write(turned, rows)
        expect(hh(next)).toBe('s("hh").struct("x x ~ x   x x x x   x x x x   x x x x").pan("0.9 0.3 0.3 0.3   0.3 0.3 0.3 0.3   0.3 0.3 0.3 0.3   0.3 0.3 0.3 0.3"),')
        expect(analyze(next).error).toBeNull()
        const back = write(next, clearSteps(rowsOf(next), 'hh', 'pan')!)
        expect(hh(back)).toBe('s("hh").struct("x x ~ x   x x x x   x x x x   x x x x").pan(slider(0.9, 0, 1)),')
    })

    it('a row that never had the knob gets the call, after its steps', () => {
        const bare = song('s("hh").struct("x x x x")').replace('"x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~"', '"x ~ ~ ~"')
        const next = write(bare, setSteps(rowsOf(bare), 'hh', 'speed', 2, [2])!)
        expect(hh(next)).toBe('s("hh").struct("x x x x").speed("1 1 2 1"),')
    })

    it('a step that is no hit any more is an ordinary step again', () => {
        const rows = setSteps(setSteps(rowsOf(PLAIN), 'hh', 'chance', 0, [0.5])!, 'hh', 'repeats', 0, [4])!
        const off = toggleStep(rows, 'hh', 0, 16)
        expect(off[1].chances?.[0]).toBe(1)
        expect(off[1].repeats?.[0]).toBe(1)
        expect(setSteps(off, 'hh', 'chance', 0, [0.2])).toBeNull()
    })

    it('goes with its hit when the grid is put on other steps', () => {
        const rows = setSteps(rowsOf(song('s("hh").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~")')), 'hh', 'repeats', 4, [3])!
        const finer = resample({ rows, steps: 16, cycles: 1, perCycle: 16 }, 32)!
        expect(finer[1].repeats?.[8]).toBe(3)
        expect(finer[1].repeats?.filter((count) => count > 1)).toHaveLength(1)
    })
})
