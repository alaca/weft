import { describe, expect, it } from 'vitest'
import { createTries } from '../../server/tries'

const MINUTE = 60 * 1000
const QUARTER = 15 * MINUTE

describe('the tries of a sender', () => {
    it('are let through as often as they may be within the time, each sender for itself', () => {
        let clock = 1_700_000_000_000
        const tries = createTries(QUARTER, () => clock)
        const refused = (who: string, count: number) => Array.from({ length: count }, () => tries.tooMany(who, 3))
        expect(refused('one', 5)).toEqual([false, false, false, true, true])
        expect(refused('other', 1)).toEqual([false])
        clock += QUARTER
        expect(refused('one', 4)).toEqual([false, false, false, true])
    })

    it('are not counted when they are refused, so whoever goes on trying is let through again a quarter of an hour after a try that was', () => {
        let clock = 1_700_000_000_000
        const tries = createTries(QUARTER, () => clock)
        expect(tries.tooMany('one', 2)).toBe(false)
        clock += 5 * MINUTE
        expect(tries.tooMany('one', 2)).toBe(false)
        for (let minutes = 0; minutes < 9; minutes++) {
            clock += MINUTE
            expect(tries.tooMany('one', 2)).toBe(true)
        }
        clock += MINUTE
        expect(tries.tooMany('one', 2)).toBe(false)
        expect(tries.tooMany('one', 2)).toBe(true)
        clock += 5 * MINUTE
        expect(tries.tooMany('one', 2)).toBe(false)
    })

    it('are forgotten with their sender once none is left in the time, and held for as long as one is', () => {
        let clock = 1_700_000_000_000
        const tries = createTries(QUARTER, () => clock)
        for (let sender = 0; sender < 1000; sender++) tries.tooMany(`early ${sender}`, 2)
        clock += 10 * MINUTE
        tries.tooMany('late', 2)
        tries.tooMany('late', 2)
        tries.tooMany('early 0', 2)
        tries.forget()
        expect(tries.senders()).toBe(1001)
        clock += 5 * MINUTE
        tries.forget()
        expect(tries.senders()).toBe(2)
        expect(tries.tooMany('late', 2)).toBe(true)
        expect(tries.tooMany('early 0', 2)).toBe(false)
        clock += QUARTER
        tries.forget()
        expect(tries.senders()).toBe(0)
    })
})
