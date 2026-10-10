import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { arrangeEdit, barsOf, clips, paint, readArrangement, resizeEdits, songLength } from '../../src/song/arrange'
import { barsText, parseBars } from '../../src/song/bars'
import { addCall, applyEdit, applyEdits } from '../../src/song/edits'

const first = (code: string) => analyze(code).patterns[0]
const on = (bars: boolean[]) => bars.flatMap((bar, i) => (bar ? [i] : []))
const set = (code: string, bars: boolean[]) => {
    const edit = arrangeEdit(code, first(code), bars)
    return edit ? applyEdit(code, edit) : code
}
const eight = (...off: number[]) => Array.from({ length: 8 }, (_, bar) => !off.includes(bar))

const BASS = 'bass: note("c2 e2")\n  .s("sawtooth")\n'
const ARRANGED = 'bass: note("c2 e2")\n  .s("sawtooth")\n  .mask("<0 0 1 1  1 1 1 1>")\n'

describe('the text of bars', () => {
    it('writes one digit a bar in groups of four', () => {
        expect(barsText(eight(0, 1))).toBe('<0 0 1 1  1 1 1 1>')
        expect(barsText([true, false, true])).toBe('<1 0 1>')
    })

    it('reads back what it wrote, and the short way of repeating a digit', () => {
        expect(parseBars('<0 0 1 1  1 1 1 1>')).toEqual(eight(0, 1))
        expect(on(parseBars('<1!4 0!2 1 1>')!)).toEqual([0, 1, 2, 3, 6, 7])
        expect(parseBars(' <1 0> ')).toEqual([true, false])
    })

    it('reads nothing else as bars', () => {
        for (const text of ['1 0 1 1', '<1 [0 1]>', '<1 0 x>', '<>', '<1 0> 1', '<1!0>', `<${'1 '.repeat(65)}>`, '<1!65>']) expect(parseBars(text), text).toBeNull()
    })
})

describe('readArrangement', () => {
    it('reads the bars a pattern plays in', () => {
        expect(readArrangement(first(ARRANGED))?.bars).toEqual(eight(0, 1))
        expect(readArrangement(first(BASS))).toBeNull()
    })

    it('leaves a mask that shapes the rhythm alone and reads the one that names bars', () => {
        const code = 'bass: note("c2 e2").mask("1 0 1 1").mask("<1 0>").s("sawtooth")\n'
        const found = readArrangement(first(code))!
        expect(found.bars).toEqual([true, false])
        expect(code.slice(found.arg.from, found.arg.to)).toBe('"<1 0>"')
        expect(readArrangement(first('bass: note("c2").mask("1 0 1 1")'))).toBeNull()
        expect(readArrangement(first('bass: note("c2").mask(sine)'))).toBeNull()
    })
})

describe('barsOf and songLength', () => {
    it('says a pattern with nothing written plays in every bar', () => {
        expect(barsOf(first(BASS), 4)).toEqual([true, true, true, true])
    })

    it('repeats what is written when the song is longer, as Strudel does', () => {
        expect(on(barsOf(first(ARRANGED), 16))).toEqual([2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 15])
        expect(on(barsOf(first(ARRANGED), 4))).toEqual([2, 3])
    })

    it('takes the length of the song from the longest arrangement', () => {
        const blocks = analyze(`${ARRANGED}\nlead: note("c4").mask("<1!16>")\n\ndrums: s("bd*4")\n`).patterns
        expect(songLength(blocks, 32)).toBe(16)
        expect(songLength(analyze(BASS).patterns, 32)).toBe(32)
    })
})

describe('paint and clips', () => {
    it('switches a run of bars on or off, whichever way it was dragged', () => {
        expect(on(paint(eight(), 2, 4, false))).toEqual([0, 1, 5, 6, 7])
        expect(on(paint(eight(0, 1, 2, 3), 3, 1, true))).toEqual([1, 2, 3, 4, 5, 6, 7])
    })

    it('finds the runs of bars that play', () => {
        expect(clips(eight(2, 5))).toEqual([
            { from: 0, length: 2 },
            { from: 3, length: 2 },
            { from: 6, length: 2 },
        ])
        expect(clips([false, false])).toEqual([])
    })
})

describe('arrangeEdit', () => {
    it('writes the bars on a line of their own at the end of the pattern', () => {
        expect(set(BASS, eight(0, 1))).toBe(ARRANGED)
        expect(set('lead: note("c4").s("triangle")\n', eight(7))).toBe('lead: note("c4").s("triangle")\n  .mask("<1 1 1 1  1 1 1 0>")\n')
    })

    it('changes only the digits when the bars are already written', () => {
        expect(set(ARRANGED, eight(0, 1, 7))).toBe(ARRANGED.replace('1 1 1 1>', '1 1 1 0>'))
        expect(arrangeEdit(ARRANGED, first(ARRANGED), eight(0, 1))).toBeNull()
    })

    it('takes the line away when the pattern plays in every bar again', () => {
        expect(set(ARRANGED, eight())).toBe(BASS)
        expect(arrangeEdit(BASS, first(BASS), eight())).toBeNull()
    })

    it('arranges a drum kit after its closing bracket', () => {
        const kit = 'drums: stack(\n  s("bd").struct("x ~ ~ ~"),\n)\n  .bank("RolandTR909")\n'
        expect(set(kit, eight(0))).toBe(`${kit.trimEnd()}\n  .mask("<0 1 1 1  1 1 1 1>")\n`)
    })
})

describe('resizeEdits', () => {
    const SONG = `${ARRANGED}\nlead: note("c4")\n  .mask("<1 1 1 1  0 0 0 0>")\n\ndrums: s("bd*4")\n`
    const resized = (length: number) => applyEdits(SONG, resizeEdits(SONG, analyze(SONG).patterns, length))

    it('repeats every arrangement when the song gets longer', () => {
        const longer = resized(16)
        expect(longer).toContain('.mask("<0 0 1 1  1 1 1 1  0 0 1 1  1 1 1 1>")')
        expect(longer).toContain('.mask("<1 1 1 1  0 0 0 0  1 1 1 1  0 0 0 0>")')
        expect(longer).toContain('drums: s("bd*4")\n')
    })

    it('cuts every arrangement when the song gets shorter, and drops one that is left full', () => {
        expect(resized(4)).toBe('bass: note("c2 e2")\n  .s("sawtooth")\n  .mask("<0 0 1 1>")\n\nlead: note("c4")\n\ndrums: s("bd*4")\n')
    })
})

describe('adding a control to an arranged pattern', () => {
    it('keeps the bars as the last line', () => {
        expect(applyEdit(ARRANGED, addCall(ARRANGED, first(ARRANGED), '.room(slider(0.3, 0, 1))'))).toBe(
            'bass: note("c2 e2")\n  .s("sawtooth")\n  .room(slider(0.3, 0, 1))\n  .mask("<0 0 1 1  1 1 1 1>")\n',
        )
    })

    it('still goes last after a mask that shapes the rhythm', () => {
        const code = 'bass: note("c2 e2")\n  .mask("1 0 1 1")\n'
        expect(applyEdit(code, addCall(code, first(code), '.room(0.3)'))).toBe('bass: note("c2 e2")\n  .mask("1 0 1 1")\n  .room(0.3)\n')
    })
})
