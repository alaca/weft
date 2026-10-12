import { describe, expect, it } from 'vitest'
import { barByBar } from '../../src/engine/barByBar'

// Where the sounds of a four bar song start, in bars. A bar answers its sounds in no order, the
// way patterns laid over each other do, and some start together or right on a bar line.
const SONG = [
    [0.5, 0, 0.25, 0, 0.75],
    [1.5, 1, 1.999],
    [],
    [3, 3.5, 3, 3.25],
]
type Sound = { name: string; at: number }

function song(barsPerSecond: number) {
    const asked: number[] = []
    const inBar = (bar: number): Sound[] => {
        asked.push(bar)
        return SONG[bar].map((at, n) => ({ name: `${bar}.${n}`, at }))
    }
    const startOf = (sound: Sound) => sound.at / barsPerSecond
    // One question for the whole song, put in the order the sounds start in.
    const whole = SONG.flatMap((starts, bar) => starts.map((at, n) => ({ name: `${bar}.${n}`, at }))).sort((a, b) => startOf(a) - startOf(b))
    return { asked, startOf, whole, due: barByBar(SONG.length, barsPerSecond, inBar, startOf) }
}

describe('a song asked for its sounds a bar at a time', () => {
    // Bars of two seconds end where a stretch ends, at 146 to the minute they end inside one,
    // bars of half a second come several to a stretch, and one of ten seconds takes five.
    for (const barsPerSecond of [0.5, 146 / 240, 2, 0.1]) {
        it(`gives every sound once, in time and in the order one question would, at ${barsPerSecond} bars a second`, () => {
            const { due, startOf, whole } = song(barsPerSecond)
            const given: Sound[] = []
            for (let until = 2; until < SONG.length / barsPerSecond + 4; until += 2) {
                const now = due(until)
                expect(now).toEqual(whole.filter((sound) => startOf(sound) >= until - 2 && startOf(sound) < until))
                given.push(...now)
            }
            expect(given).toEqual(whole)
            expect(due(1000)).toEqual([])
        })
    }

    it('asks for a bar only when a sound of it may be due', () => {
        const { asked, due } = song(0.5)
        due(2)
        expect(asked).toEqual([0])
        due(2)
        expect(asked).toEqual([0])
        due(4.5)
        expect(asked).toEqual([0, 1, 2])
        due(100)
        expect(asked).toEqual([0, 1, 2, 3])
    })

    it('keeps a sound that starts at the very time asked for the next answer', () => {
        const { due } = song(0.5)
        expect(due(2).map((sound) => sound.name)).toEqual(['0.1', '0.3', '0.2', '0.0', '0.4'])
        expect(due(3).map((sound) => sound.name)).toEqual(['1.1'])
        expect(due(6).map((sound) => sound.name)).toEqual(['1.0', '1.2'])
    })
})
