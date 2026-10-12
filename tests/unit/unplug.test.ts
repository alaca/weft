import { afterEach, describe, expect, it, vi } from 'vitest'

class FakeNode {
    into: FakeNode[] = []
    numberOfOutputs = 1
    constructor(readonly context: FakeContext) {}
    connect(to: FakeNode) {
        if (!this.into.includes(to)) this.into.push(to)
        return to
    }
    disconnect() {
        this.into = []
    }
}
class FakeWorklet extends FakeNode {}
class FakeContext {
    createGain() {
        return new FakeNode(this)
    }
}

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('an unplugged worklet node', () => {
    it('is plugged into a place nothing listens to, once it has had a moment to end', async () => {
        vi.useFakeTimers()
        vi.stubGlobal('AudioNode', FakeNode)
        vi.stubGlobal('AudioWorkletNode', FakeWorklet)
        const { restUnpluggedWorklets } = await import('../../src/engine/unplug')
        restUnpluggedWorklets()
        const context = new FakeContext()
        const out = new FakeNode(context)
        const effect = new FakeWorklet(context)
        const plain = new FakeNode(context)
        effect.connect(out)
        plain.connect(out)
        effect.disconnect()
        plain.disconnect()
        vi.advanceTimersByTime(200)
        expect(effect.into).toEqual([])
        vi.advanceTimersByTime(200)
        expect(effect.into).toHaveLength(1)
        expect(effect.into[0]).not.toBe(out)
        expect(plain.into).toEqual([])
    })
})
