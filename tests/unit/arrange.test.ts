import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { arrangeEdit, arrangeSong, barsOf, clips, paint, readArrangement, songLength } from '../../src/song/arrange'
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
const ARRANGED = 'bass: note("c2 e2")\n  .s("sawtooth")\n  .mask("<0!2 1!6>")\n'

describe('the text of bars', () => {
    it('writes runs of bars that play or rest, with a count when a run is longer than one', () => {
        expect(barsText(eight(0, 1))).toBe('<0!2 1!6>')
        expect(barsText([true, false, true])).toBe('<1 0 1>')
        expect(barsText(eight(0, 1, 2, 3, 4, 5, 6, 7))).toBe('<0!8>')
    })

    it('stays short however long the song is', () => {
        const twentyMinutes = Array.from({ length: 620 }, (_, bar) => bar >= 8 && bar < 600)
        expect(barsText(twentyMinutes)).toBe('<0!8 1!592 0!20>')
        expect(parseBars('<0!8 1!592 0!20>')).toEqual(twentyMinutes)
    })

    it('reads back what it wrote, and bars written out one by one', () => {
        expect(parseBars('<0!2 1!6>')).toEqual(eight(0, 1))
        expect(parseBars('<0 0 1 1  1 1 1 1>')).toEqual(eight(0, 1))
        expect(on(parseBars('<1!4 0!2 1 1>')!)).toEqual([0, 1, 2, 3, 6, 7])
        expect(parseBars(' <1 0> ')).toEqual([true, false])
    })

    it('reads nothing else as bars', () => {
        for (const text of ['1 0 1 1', '<1 [0 1]>', '<1 0 x>', '<>', '<1 0> 1', '<1!0>', '<1!4097>', '<1!4000 0!97>']) expect(parseBars(text), text).toBeNull()
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
        expect(set('lead: note("c4").s("triangle")\n', eight(7))).toBe('lead: note("c4").s("triangle")\n  .mask("<1!7 0>")\n')
    })

    it('changes only the digits when the bars are already written', () => {
        expect(set(ARRANGED, eight(0, 1, 7))).toBe(ARRANGED.replace('<0!2 1!6>', '<0!2 1!5 0>'))
        expect(arrangeEdit(ARRANGED, first(ARRANGED), eight(0, 1))).toBeNull()
    })

    it('takes the line away when the pattern plays in every bar again', () => {
        expect(set(ARRANGED, eight())).toBe(BASS)
        expect(arrangeEdit(BASS, first(BASS), eight())).toBeNull()
    })

    it('arranges a drum kit after its closing bracket', () => {
        const kit = 'drums: stack(\n  s("bd").struct("x ~ ~ ~"),\n)\n  .bank("RolandTR909")\n'
        expect(set(kit, eight(0))).toBe(`${kit.trimEnd()}\n  .mask("<0 1!7>")\n`)
    })
})

describe('arrangeSong', () => {
    const SONG = `${ARRANGED}\nlead: note("c4")\n  .mask("<1!4 0!4>")\n\ndrums: s("bd*4")\n`
    const blocks = (code: string) => analyze(code).patterns
    const arrange = (code: string, id: string, bars: boolean[], length = songLength(blocks(code), 16)) => {
        const result = arrangeSong(code, blocks(code), id, bars, length)
        return { code: applyEdits(code, result.edits), length: result.length }
    }
    const lane = (code: string, id: string) => on(barsOf(blocks(code).find((p) => p.id === id)!, songLength(blocks(code), 16)))

    it('changes only the pattern that was painted when the song keeps its length', () => {
        const next = arrange(SONG, 'bass', eight(0, 1, 2))
        expect(next.code).toBe(SONG.replace('<0!2 1!6>', '<0!3 1!5>'))
        expect(next.length).toBe(8)
    })

    it('makes the song longer when a bar past its end is filled, and lets the others rest there', () => {
        const bars = [...eight(0, 1), false, false, true, true]
        const next = arrange(SONG, 'bass', bars)
        expect(next.length).toBe(12)
        expect(next.code).toContain('.mask("<0!2 1!6 0!2 1!2>")')
        expect(next.code).toContain('lead: note("c4")\n  .mask("<1!4 0!8>")')
        expect(next.code).toContain('drums: s("bd*4")\n  .mask("<1!8 0!4>")')
        expect(lane(next.code, 'drums')).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    })

    it('makes the song shorter when its last bars are emptied in every pattern', () => {
        const first = arrange(SONG, 'drums', eight(6, 7)).code
        const next = arrange(first, 'bass', eight(0, 1, 6, 7))
        expect(next.length).toBe(6)
        expect(next.code).toBe('bass: note("c2 e2")\n  .s("sawtooth")\n  .mask("<0!2 1!4>")\n\nlead: note("c4")\n  .mask("<1!4 0!2>")\n\ndrums: s("bd*4")\n')
    })

    it('writes nothing for a pattern that plays in every bar of the song', () => {
        const next = arrange('bass: note("c2")\n\ndrums: s("bd*4")\n', 'bass', Array(16).fill(true))
        expect(next.code).toBe('bass: note("c2")\n\ndrums: s("bd*4")\n')
        expect(next.length).toBe(16)
    })

    it('starts a song of sixteen bars from patterns that have nothing written', () => {
        const code = 'bass: note("c2")\n\ndrums: s("bd*4")\n'
        const bars = Array.from({ length: 20 }, (_, bar) => bar < 16 || bar === 19)
        const next = arrange(code, 'bass', bars)
        expect(next.length).toBe(20)
        expect(next.code).toBe('bass: note("c2")\n  .mask("<1!16 0!3 1>")\n\ndrums: s("bd*4")\n  .mask("<1!16 0!4>")\n')
    })

    it('keeps the length when nothing is left playing at all', () => {
        const code = 'bass: note("c2")\n'
        const next = arrange(code, 'bass', Array(16).fill(false))
        expect(next.length).toBe(16)
        expect(next.code).toBe('bass: note("c2")\n  .mask("<0!16>")\n')
    })

    it('makes a song of any length', () => {
        const bars = Array.from({ length: 620 }, (_, bar) => bar < 8 || bar === 619)
        const next = arrange(SONG, 'bass', bars)
        expect(next.length).toBe(620)
        expect(next.code).toContain('.mask("<1!8 0!611 1>")')
        expect(next.code).toContain('.mask("<1!4 0!616>")')
        expect(songLength(blocks(next.code), 16)).toBe(620)
    })
})

describe('adding a control to an arranged pattern', () => {
    it('keeps the bars as the last line', () => {
        expect(applyEdit(ARRANGED, addCall(ARRANGED, first(ARRANGED), '.room(slider(0.3, 0, 1))'))).toBe(
            'bass: note("c2 e2")\n  .s("sawtooth")\n  .room(slider(0.3, 0, 1))\n  .mask("<0!2 1!6>")\n',
        )
    })

    it('still goes last after a mask that shapes the rhythm', () => {
        const code = 'bass: note("c2 e2")\n  .mask("1 0 1 1")\n'
        expect(applyEdit(code, addCall(code, first(code), '.room(0.3)'))).toBe('bass: note("c2 e2")\n  .mask("1 0 1 1")\n  .room(0.3)\n')
    })
})
