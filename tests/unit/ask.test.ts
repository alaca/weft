import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { askSoon } from '../../src/ui/askSoon'

// Every question takes two milliseconds here, and a turn of asking is over once five have passed.
let clock = 0
let asked: string[] = []
const one = (name: string) => () => {
    clock += 2
    asked.push(name)
    return true
}

beforeEach(() => {
    clock = 0
    asked = []
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.stubGlobal('window', globalThis)
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
})

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

describe('asking patterns what they play, a little at a time', () => {
    it('asks for no strip on the spot, and then for the ones in sight first and the folded ones last', () => {
        askSoon(one('folded'), 'folded')
        askSoon(one('scrolled away'), 'unseen')
        askSoon(one('in sight'), 'seen')
        askSoon(one('also in sight'), 'seen')
        expect(asked).toEqual([])

        vi.runOnlyPendingTimers()
        expect(asked).toEqual(['in sight', 'also in sight', 'scrolled away'])
        vi.runOnlyPendingTimers()
        expect(asked).toEqual(['in sight', 'also in sight', 'scrolled away', 'folded'])
        expect(vi.getTimerCount()).toBe(0)
    })

    it('starts on a row of the Song panel on the spot, lets a strip go first and then goes on with the row', () => {
        let bars = 0
        askSoon(() => {
            clock += 2
            asked.push(`bar ${++bars}`)
            return bars === 6
        })
        expect(asked).toEqual(['bar 1', 'bar 2', 'bar 3'])

        askSoon(one('strip'), 'seen')
        vi.runOnlyPendingTimers()
        expect(asked).toEqual(['bar 1', 'bar 2', 'bar 3', 'strip', 'bar 4', 'bar 5'])
        vi.runOnlyPendingTimers()
        expect(asked).toEqual(['bar 1', 'bar 2', 'bar 3', 'strip', 'bar 4', 'bar 5', 'bar 6'])
        expect(vi.getTimerCount()).toBe(0)
    })
})
