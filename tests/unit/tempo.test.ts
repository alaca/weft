import { describe, expect, it } from 'vitest'
import { barByBar } from '../../src/engine/barByBar'
import { analyze } from '../../src/song/analyze'
import { applyEdit } from '../../src/song/edits'
import { readTempoLane, secondsOf, tempoAt, tempoLaneEdit } from '../../src/song/tempo'

const SONG = 'setcpm(120/4)\n\ndrums: s("bd*4")\n'
const put = (code: string, values: number[] | null) => {
    const edit = tempoLaneEdit(code, analyze(code), values)
    return edit ? applyEdit(code, edit) : code
}

describe('a tempo for every bar', () => {
    it('is a line of its own under the tempo of the song, written like a knob that is drawn', () => {
        const drawn = put(SONG, [120, 120, 120, 120, 132, 140, 140, 140])
        expect(drawn).toBe('setcpm(120/4)\n// tempo <120!4 132 140!3>\n\ndrums: s("bd*4")\n')
        expect(readTempoLane(drawn)?.values).toEqual([120, 120, 120, 120, 132, 140, 140, 140])
        expect(analyze(drawn).error).toBeNull()
        expect(analyze(drawn).tempo?.bpm).toBe(120)
    })

    it('is changed where it stands, kept within what a tempo can be, and taken out again whole', () => {
        const drawn = put(SONG, [120, 120])
        const faster = put(drawn, [500, 10])
        expect(faster).toContain('// tempo <240 40>\n')
        expect(put(faster, [240, 40])).toBe(faster)
        expect(put(faster, null)).toBe(SONG)
    })

    it('goes in front of a song that sets no tempo', () => {
        expect(put('drums: s("bd*4")\n', [90, 100])).toBe('// tempo <90 100>\n\ndrums: s("bd*4")\n')
    })

    it('is not read from a line that is something else', () => {
        for (const line of ['// tempo 120', '// tempo <fast slow>', '// tempo <0 120>', 'tempo <120>', '// the tempo <120> is nice']) expect(readTempoLane(`setcpm(120/4)\n${line}\n`), line).toBeNull()
    })

    it('gives each bar its tempo, going round when it is shorter than the song, and says how long the bars last', () => {
        const lane = readTempoLane('// tempo <240 120>')
        expect([0, 1, 2, 3].map((bar) => tempoAt(lane, bar, 100))).toEqual([240, 120, 240, 120])
        expect(tempoAt(null, 7, 100)).toBe(100)
        // A bar of four beats lasts a second at 240 and two at 120.
        expect(secondsOf(lane, 4, 100)).toBe(6)
        expect(secondsOf(null, 4, 120)).toBe(8)
    })
})

describe('a song made into a file bar by bar', () => {
    it('asks each bar when it is due, where the bars are not all as long', () => {
        const starts = [0, 1, 3, 4]
        const asked: number[] = []
        const due = barByBar(4, (bar) => starts[bar], (bar) => (asked.push(bar), [starts[bar]]), (sound) => sound)
        expect(due(0.5)).toEqual([0])
        expect(asked).toEqual([0])
        expect(due(3.5)).toEqual([1, 3])
        expect(asked).toEqual([0, 1, 2])
        expect(due(10)).toEqual([4])
    })
})
