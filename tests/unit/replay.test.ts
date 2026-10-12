import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createReplay } from '../../src/engine/replay'

let now = 0
let played = 0
let song: ReturnType<typeof createReplay>

// Time goes by and what is due is done.
const pass = (ms: number) => {
    now += ms
    vi.advanceTimersByTime(ms)
}
// Time goes by with the window too busy to do what is due.
const busy = (ms: number) => {
    now += ms
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    now = 0
    played = 0
    song = createReplay(() => void played++)
})

afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
})

describe('playing the song again after a change', () => {
    it('is done once, in a turn of its own, for all that ask in the same turn', () => {
        song.replay()
        song.replay()
        expect(played).toBe(0)
        pass(0)
        expect(played).toBe(1)
        pass(2000)
        expect(played).toBe(1)
    })

    it('waits until a run of held changes has rested', () => {
        for (let step = 0; step < 5; step++) {
            song.replay(true)
            pass(100)
        }
        pass(149)
        expect(played).toBe(0)
        pass(1)
        expect(played).toBe(1)
        pass(2000)
        expect(played).toBe(1)
    })

    it('is done about once a second while a long run lasts, and once more when it has rested', () => {
        for (let step = 0; step < 25; step++) {
            song.replay(true)
            pass(100)
        }
        expect(played).toBe(2)
        pass(150)
        expect(played).toBe(3)
        pass(2000)
        expect(played).toBe(3)
    })

    it('takes what is held along with a change that does not wait', () => {
        song.replay(true)
        pass(100)
        song.replay()
        pass(0)
        expect(played).toBe(1)
        pass(2000)
        expect(played).toBe(1)
    })

    it('is not put off by a held change once it is due', () => {
        song.replay()
        song.replay(true)
        pass(0)
        expect(played).toBe(1)

        song.replay(true)
        pass(200)
        busy(60)
        song.replay(true)
        pass(50)
        expect(played).toBe(2)
    })

    it('does what is held at once when the run is over, and nothing when nothing is held', () => {
        song.replayHeld()
        pass(2000)
        expect(played).toBe(0)

        song.replay(true)
        pass(100)
        song.replayHeld()
        pass(0)
        expect(played).toBe(1)
        pass(2000)
        expect(played).toBe(1)
    })

    it('says whether a change still waits, until the song is played again by it or by other means', () => {
        expect(song.replayWaits()).toBe(false)
        song.replay(true)
        pass(100)
        expect(song.replayWaits()).toBe(true)
        pass(150)
        expect(played).toBe(1)
        expect(song.replayWaits()).toBe(false)

        song.replay(true)
        song.dropReplay()
        expect(song.replayWaits()).toBe(false)
    })

    it('is dropped when the song was played by other means, and what is held after that is a run of its own', () => {
        song.replay(true)
        pass(100)
        song.dropReplay()
        pass(2000)
        expect(played).toBe(0)

        song.replay(true)
        pass(249)
        expect(played).toBe(0)
        pass(1)
        expect(played).toBe(1)
    })
})
