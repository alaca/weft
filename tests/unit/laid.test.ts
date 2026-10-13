import { describe, expect, it } from 'vitest'
import { panelFor } from '../../src/controls/views'
import { analyze } from '../../src/song/analyze'
import { audioCode, audioEdits, barsOfSound, fadeTexts, heardIn, JOIN, listFrom, listText, readLaid, relist, startOf } from '../../src/song/audio'
import { barsOf } from '../../src/song/arrange'
import { curvesOf } from '../../src/song/curves'
import { applyEdits } from '../../src/song/edits'
import { isDrums } from '../../src/song/kit'
import { readSlices } from '../../src/song/slices'
import { fits } from '../../src/sounds/apply'

const block = (code: string) => analyze(code).patterns[0]
const read = (code: string) => readLaid(block(code))!
const laid = (start: number, bars: number, length: number, late = 0) => `${audioCode('vocal', 'my_take', bars, listFrom(start, bars, length), late, ['.pan(slider(0.5, 0, 1))'])}\n`
const plan = (code: string, change: Partial<Parameters<typeof audioEdits>[2]> & { plays?: boolean[] } = {}) => {
    const audio = read(code)
    const list = change.list ?? audio.list
    const bars = change.bars ?? audio.bars
    const plays = change.plays ?? barsOf(block(code), list.length)
    return applyEdits(code, audioEdits(code, audio, { bars, list, lateBy: change.lateBy ?? audio.lateBy, heard: heardIn(list, bars, plays), fadeIn: change.fadeIn ?? audio.fadeIn, fadeOut: change.fadeOut ?? audio.fadeOut }))
}

describe('a recording along the song', () => {
    it('is as many bars long as its seconds make at the tempo of the song', () => {
        expect(barsOfSound(37.04166, 2)).toBe(18.52083)
        expect(barsOfSound(8, 2)).toBe(4)
    })

    it('is laid on the bars from one of them on: each bar plays the next bar of it, and the rest of the song rests', () => {
        expect(listText(listFrom(4, 3.5, 12))).toBe('<~!4 0 1 2 3 ~!4>')
        expect(listText(listFrom(0, 2, 2))).toBe('<0 1>')
        // A song that is too short for all of it is made as long as it takes.
        expect(listFrom(6, 3.5, 8)).toHaveLength(10)
    })

    it('is written as code that Strudel plays, and read back from it', () => {
        const code = laid(4, 3.5, 12, 0.25)
        expect(code).toBe('vocal: s("my_take").slice(3.5, "<~!4 0 1 2 3 ~!4>")\n  .late(0.25)\n  .attack(0.02).release(0.02)\n  .pan(slider(0.5, 0, 1))\n')
        const audio = read(code)
        expect([audio.sound.value, audio.bars, audio.lateBy, audio.fadeIn, audio.fadeOut]).toEqual(['my_take', 3.5, 0.25, 0, 0])
        expect(startOf(audio.list)).toBe(4)
        expect(isDrums(block(code))).toBe(false)
        expect(readSlices(block(code))).toBeNull()
        expect(fits(block(code), 'yours')).toBe(true)
        expect(fits(block(code), 'samples')).toBe(false)
    })

    it('is left to the code when it is written another way', () => {
        for (const code of ['vocal: s("my_take").slice(4, "0 1 2 3")\n', 'vocal: s("my_take").slice(4, "<0 [1 2] 3>")\n', 'vocal: s("bd hh").slice(4, "<0 1 2 3>")\n', 'vocal: s("my_take").chop(4)\n']) {
            expect(readLaid(block(code)), code).toBeNull()
        }
    })

    it('is moved by writing the list again, and by a part of a bar with a line of its own that goes when it is not needed', () => {
        const code = laid(4, 3.5, 12)
        const moved = plan(code, { list: listFrom(2, 3.5, 12), lateBy: 0.125 })
        expect(moved).toContain('.slice(3.5, "<~!2 0 1 2 3 ~!6>")\n  .late(0.125)\n  .attack(0.02)')
        expect(read(moved).lateBy).toBe(0.125)
        const back = plan(moved, { lateBy: 0 })
        expect(back).not.toContain('late')
        expect(read(back).attack).not.toBeNull()
    })

    it('goes on with what is left of it when the song is made longer, and is cut when it is made shorter', () => {
        const audio = read(laid(2, 6.2, 5))
        expect(listText(audio.list)).toBe('<~!2 0 1 2 3 4 5 6>')
        expect(listText(relist({ ...audio, list: audio.list.slice(0, 5) }, 12))).toBe('<~!2 0 1 2 3 4 5 6 ~!3>')
        expect(listText(relist(audio, 4))).toBe('<~!2 0 1>')
    })

    it('fades in the bar a stretch of it begins in and after the bar it ends in, a number for every bar', () => {
        const heard = [false, false, true, true, true, false, true, false]
        expect(fadeTexts(heard, 0, 0)).toEqual({ attack: String(JOIN), release: String(JOIN) })
        expect(fadeTexts(heard, 1.5, 3)).toEqual({ attack: '"<0.02!2 1.5 0.02!3 1.5 0.02>"', release: '"<0.02!4 3 0.02 3 0.02>"' })
    })

    it('a fade is written where the pieces are joined, read back, and follows the bars the recording is heard in', () => {
        const code = `${laid(2, 4, 8)}  .mask("<0!2 1!4 0!2>")\n`
        const faded = plan(code, { fadeIn: 1, fadeOut: 2.5 })
        expect(faded).toContain('.attack("<0.02!2 1 0.02!5>").release("<0.02!5 2.5 0.02!2>")')
        expect([read(faded).fadeIn, read(faded).fadeOut]).toEqual([1, 2.5])
        // Cut a bar shorter at the end: the fade out moves to the bar that is now the last.
        const shorter = plan(faded, { plays: [false, false, true, true, true, false, false, false] })
        expect(shorter).toContain('.release("<0.02!4 2.5 0.02!3>")')
        expect(plan(faded, { fadeIn: 0, fadeOut: 0 })).toContain('.attack(0.02).release(0.02)')
    })

    it('the fades are not lists drawn over the song, and what joins the pieces is not offered as a knob', () => {
        const faded = plan(`${laid(0, 4, 4)}`, { fadeIn: 1 })
        expect(curvesOf(block(faded))).toEqual([])
        const knobs = panelFor(block(faded)).flatMap((group) => group.items.map((item) => item.fn))
        for (const fn of ['attack', 'release', 'speed', 'begin', 'end']) expect(knobs, fn).not.toContain(fn)
        expect(knobs).toContain('lpf')
    })

    it('is told how long it is again when the tempo changes, from the bar it began at', () => {
        const code = laid(2, 4, 8)
        const slower = plan(code, { bars: 3.2, list: listFrom(2, 3.2, 8) })
        expect(slower).toContain('.slice(3.2, "<~!2 0 1 2 3 ~!2>")')
    })
})
