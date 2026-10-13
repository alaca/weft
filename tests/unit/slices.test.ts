import { describe, expect, it } from 'vitest'
import { checkSong } from '../../src/guard/check'
import { analyze } from '../../src/song/analyze'
import { applyEdits } from '../../src/song/edits'
import { isDrums } from '../../src/song/kit'
import { backwards, cellsOf, fitEdit, inOrder, readSlices, recut, shuffled, sliceEdits, sliceRows, slicesCode, slicesText } from '../../src/song/slices'
import { fits, soundEdit } from '../../src/sounds/apply'

const song = (text: string, count = 8, call = 'splice') => `loop: s("my_break").${call}(${count}, "${text}")\n  .pan(slider(0.5, 0, 1))\n`
const block = (code: string) => analyze(code).patterns[0]
const read = (code: string) => readSlices(block(code))!

describe('a sample cut into parts', () => {
    it('is read from the code: how many parts, which part on which step, and whether each is fitted to its step', () => {
        const slices = read(song('0 1 ~ 3   [0,4] 5 6 7'))
        expect(slices.parts).toBe(8)
        expect(slices.fit).toBe(true)
        expect(slices.cells).toEqual([[0], [1], [], [3], [0, 4], [5], [6], [7]])
        expect(read(song('0 1 2 3   4 5 6 7', 8, 'slice')).fit).toBe(false)
        expect(isDrums(block(song('0 1 2 3   4 5 6 7')))).toBe(false)
    })

    it('a pattern of more than a bar has its steps in brackets', () => {
        const text = slicesText(inOrder(16), 2)
        expect(text).toBe('[0 1 2 3   4 5 6 7   8 9 10 11   12 13 14 15]/2')
        const slices = read(song(text, 16))
        expect([slices.cycles, slices.perCycle, slices.parts]).toEqual([2, 8, 16])
    })

    it('is left to the code when it is written another way', () => {
        for (const code of [song('0 1 2 3   4 5 6 9'), song('0 1 2 3', 8), song('0 1 2 3   4 5 6 7', 8, 'chop'), song('0*2 1 2 3   4 5 6 7'), 'loop: s("bd hh").splice(8, "0 1 2 3   4 5 6 7")\n']) {
            expect(readSlices(block(code)), code).toBeNull()
        }
    })

    it('each part is a row of a grid, and the grid is written back as it stands', () => {
        const slices = read(song('0 1 2 3   4 5 6 7'))
        const rows = sliceRows(slices.cells)
        expect(rows).toHaveLength(8)
        rows[2].steps[0] = true
        rows[7].steps[7] = false
        const next = applyEdits(song('0 1 2 3   4 5 6 7'), sliceEdits(slices, cellsOf(rows), 1))
        expect(next).toContain('.splice(8, "[0,2] 1 2 3   4 5 6 ~")')
        expect(analyze(next).error).toBeNull()
    })

    it('can be put backwards, shuffled without losing a part, and switched off the tempo', () => {
        expect(slicesText(backwards(8), 1)).toBe('7 6 5 4   3 2 1 0')
        const mixed = shuffled(inOrder(8), () => 0.3)
        expect(mixed.flat().sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
        expect(mixed).not.toEqual(inOrder(8))
        const code = song('0 1 2 3   4 5 6 7')
        expect(applyEdits(code, [fitEdit(read(code), false)])).toContain('s("my_break").slice(8, ')
    })

    it('cut twice as fine it sounds the same, and cut over another length its parts are put in order', () => {
        const slices = read(song('3 ~ 0 1   ~ ~ 7 7'))
        expect(slicesText(recut(slices, 16, 1), 1)).toBe('6 7 ~ ~   0 1 2 3   ~ ~ ~ ~   14 15 14 15')
        const longer = applyEdits(song('3 ~ 0 1   ~ ~ 7 7'), sliceEdits(slices, recut(slices, 8, 2), 2))
        expect(longer).toContain('.splice(16, "[0 1 2 3   4 5 6 7   8 9 10 11   12 13 14 15]/2")')
        expect(recut(read(song('~ ~ ~ ~   ~ ~ ~ ~')), 8, 2).every((cell) => cell.length === 0)).toBe(true)
    })

    it('takes a sample or a sound of your own, in the place of the one it plays', () => {
        const code = song('0 1 2 3   4 5 6 7')
        expect(['kits', 'instruments', 'synths', 'samples', 'presets', 'yours'].filter((group) => fits(block(code), group as never))).toEqual(['samples', 'yours'])
        expect(applyEdits(code, [soundEdit(code, block(code), { group: 'yours', name: 'other_loop', label: 'Other loop', parts: [] })])).toContain('s("other_loop").splice(8,')
    })

    it('starts as the sample as it was, in sixteen parts, and is music code', () => {
        const code = slicesCode('slices', 'my_break', ['.pan(slider(0.5, 0, 1))'])
        expect(code).toBe('slices: s("my_break").splice(16, "0 1 2 3   4 5 6 7   8 9 10 11   12 13 14 15")\n  .pan(slider(0.5, 0, 1))')
        expect(read(code).cells).toEqual(inOrder(16))
        expect(checkSong(code)).toBeNull()
    })
})
