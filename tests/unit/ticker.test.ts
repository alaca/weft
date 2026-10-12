import { afterEach, describe, expect, it, vi } from 'vitest'

type Told = { id: number; ms?: number }

class FakeWorker {
    static made: FakeWorker[] = []
    told: Told[] = []
    onmessage: ((event: { data: unknown }) => void) | null = null
    constructor() {
        FakeWorker.made.push(this)
    }
    postMessage(message: Told) {
        this.told.push(message)
    }
    says(data: unknown) {
        this.onmessage?.({ data })
    }
}

const fresh = async () => {
    vi.resetModules()
    vi.useFakeTimers()
    return import('../../src/engine/ticker')
}

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    FakeWorker.made = []
})

describe("the timer of the song's clock", () => {
    it('is kept by the worker, and a tick that arrives after it was stopped does nothing', async () => {
        vi.stubGlobal('Worker', FakeWorker)
        const { startTicking, stopTicking } = await fresh()
        const worker = FakeWorker.made[0]
        worker.says('ready')
        const tick = vi.fn()
        const id = startTicking(tick, 100)
        expect(id).toBeTypeOf('number')
        expect(worker.told).toEqual([{ id, ms: 100 }])
        worker.says(id)
        worker.says(id)
        expect(tick).toHaveBeenCalledTimes(2)
        vi.advanceTimersByTime(1000)
        expect(tick).toHaveBeenCalledTimes(2)

        stopTicking(id)
        expect(worker.told).toEqual([{ id, ms: 100 }, { id }])
        worker.says(id)
        expect(tick).toHaveBeenCalledTimes(2)

        const next = vi.fn()
        const nextId = startTicking(next, 100)
        expect(nextId).not.toBe(id)
        worker.says(id)
        expect(next).not.toHaveBeenCalled()
        worker.says(nextId)
        expect(next).toHaveBeenCalledTimes(1)
    })

    it("is the window's own timer until the worker has said that it runs", async () => {
        vi.stubGlobal('Worker', FakeWorker)
        const { startTicking, stopTicking } = await fresh()
        const worker = FakeWorker.made[0]
        const tick = vi.fn()
        const id = startTicking(tick, 100)
        expect(id).toBeTypeOf('number')
        vi.advanceTimersByTime(350)
        expect(tick).toHaveBeenCalledTimes(3)

        worker.says('ready')
        stopTicking(id)
        vi.advanceTimersByTime(500)
        expect(tick).toHaveBeenCalledTimes(3)
        expect(worker.told).toEqual([])
    })

    it("is the window's own timer where a worker cannot be made", async () => {
        vi.stubGlobal(
            'Worker',
            class {
                constructor() {
                    throw new Error('No workers here')
                }
            },
        )
        const { startTicking, stopTicking } = await fresh()
        const tick = vi.fn()
        const id = startTicking(tick, 100)
        expect(id).toBeTypeOf('number')
        vi.advanceTimersByTime(350)
        expect(tick).toHaveBeenCalledTimes(3)
        stopTicking(id)
        vi.advanceTimersByTime(500)
        expect(tick).toHaveBeenCalledTimes(3)
    })
})
