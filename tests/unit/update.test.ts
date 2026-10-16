import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const HOUR = 60 * 60 * 1000

// Each test has the module to itself, as an app that has just started.
async function fresh() {
    vi.resetModules()
    const update = await import('../../src/app/update')
    const store = await import('../../src/stores/update')
    return { ...update, ...store }
}

describe('an app that stays open', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('looks again for a newer version every few hours, and only while nothing plays', async () => {
        const app = await fresh()
        let asked = 0
        let busy = false
        app.attachUpdate({ keep: () => undefined, look: async () => (asked++, null) })
        const stop = app.lookNowAndThen(() => busy)
        await app.lookForNewVersion(false)
        expect(asked).toBe(1)

        await vi.advanceTimersByTimeAsync(5 * HOUR)
        expect(asked).toBe(1)
        busy = true
        await vi.advanceTimersByTimeAsync(2 * HOUR)
        expect(asked).toBe(1)
        busy = false
        await vi.advanceTimersByTimeAsync(HOUR / 2)
        expect(asked).toBe(2)
        stop()
    })

    it('does not bring back by itself a version that was put off, but offers a newer one', async () => {
        const app = await fresh()
        let newest = '9.9.9'
        app.attachUpdate({ keep: () => undefined, look: async () => ({ version: newest, notes: '', install: async () => undefined }) })
        await app.lookForNewVersion(false)
        expect(app.updateStage()).toBe('found')
        app.putUpdateOff()

        await app.lookForNewVersion(false)
        expect(app.updateStage()).toBe('none')
        await app.lookForNewVersion(true)
        expect(app.updateStage()).toBe('found')
        app.putUpdateOff()

        newest = '9.9.10'
        await app.lookForNewVersion(false)
        expect(app.updateStage()).toBe('found')
        expect(app.updateVersion()).toBe('9.9.10')
    })
})
