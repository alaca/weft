import { describe, expect, it } from 'vitest'
import { followClock, readClockWord, type ClockWord } from '../../src/library/clockIn'

const stamped = (bytes: number[], micros: number) => {
    const said = new Uint8Array(bytes.length + 8)
    said.set(bytes)
    new DataView(said.buffer).setBigUint64(bytes.length, BigInt(micros), true)
    return said
}

describe('a word of a MIDI clock', () => {
    it('is read with the moment the app put after it, or the one the window handed beside it', () => {
        expect(readClockWord(stamped([0xf8], 1_500_000))).toEqual({ kind: 'tick', at: 1500 })
        expect(readClockWord(stamped([0xfa], 2000))).toEqual({ kind: 'start', at: 2 })
        expect(readClockWord(new Uint8Array([0xfb]), 12.5)).toEqual({ kind: 'go on', at: 12.5 })
        expect(readClockWord(new Uint8Array([0xfc]), 3)).toEqual({ kind: 'stop', at: 3 })
        // Sixteenth notes, in two bytes of seven bits, the low one first: 130 is 32.5 quarters.
        expect(readClockWord(stamped([0xf2, 2, 1], 0))).toEqual({ kind: 'place', quarters: 32.5, at: 0 })
        expect(readClockWord(new Uint8Array([0x90, 60, 100]), 1)).toBeNull()
        expect(readClockWord(new Uint8Array([0xf8]))).toBeNull()
    })
})

describe('following a MIDI clock', () => {
    const run = (words: ClockWord[]) => {
        const said: string[] = []
        const follow = followClock({
            start: (quarters, bpm) => said.push(`start ${quarters}${bpm ? ` at ${bpm.toFixed(1)}` : ''}`),
            stop: () => said.push('stop'),
            beat: (bpm, quarters) => said.push(`${bpm.toFixed(1)} at ${quarters}`),
        })
        words.forEach(follow)
        return said
    }
    // Ticks at a tempo, from a moment on: 120 a minute is a tick every 20.83 ms.
    const ticks = (count: number, bpm: number, from = 0): ClockWord[] => Array.from({ length: count }, (_, at) => ({ kind: 'tick', at: from + (at * 60000) / (bpm * 24) }))

    // A clock ticks on while it is stopped, and is started just before one of its ticks.
    const startedAt = (all: ClockWord[], tick: number): ClockWord[] => [...all.slice(0, tick), { kind: 'start', at: all[tick].at - 1 }, ...all.slice(tick)]

    it('takes the tempo from the ticks, and says where it is every sixteenth note from the first tick after a start', () => {
        expect(run(startedAt(ticks(37, 120), 24))).toEqual(['start 0 at 120.0', '120.0 at 0', '120.0 at 0.25', '120.0 at 0.5'])
    })

    it('is not shaken by a tick that comes late', () => {
        const all = ticks(37, 120)
        all[30] = { kind: 'tick', at: all[30].at + 8 }
        expect(run(startedAt(all, 24))).toEqual(['start 0 at 120.0', '120.0 at 0', '120.0 at 0.25', '120.0 at 0.5'])
    })

    it('says nothing of a beat before it has heard enough ticks to know the tempo', () => {
        expect(run([{ kind: 'start', at: 0 }, ...ticks(7, 90, 1)])).toEqual(['start 0', '90.0 at 0.25'])
    })

    it('goes on from where it stopped, or from where it was told the song is', () => {
        const said = run([{ kind: 'start', at: 0 }, ...ticks(48, 120, 1), { kind: 'stop', at: 1100 }, { kind: 'go on', at: 2000 }, { kind: 'stop', at: 2100 }, { kind: 'place', quarters: 32.5, at: 3000 }, { kind: 'go on', at: 3100 }])
        expect(said.filter((line) => !/^[\d.]+ at /.test(line))).toEqual(['start 0', 'stop', 'start 2 at 120.0', 'stop', 'start 32.5 at 120.0'])
    })

    it('forgets the tempo after a long silence, and follows a new one', () => {
        const said = run([...ticks(24, 120), ...startedAt(ticks(37, 100, 5000), 30)])
        expect(said).toEqual(['start 0 at 100.0', '100.0 at 0', '100.0 at 0.25'])
    })
})
