import { afterEach, describe, expect, it, vi } from 'vitest'

type Processor = { process(input: unknown, outputs: Float32Array[][], params: Record<string, number[]>): boolean }

// Both are loaded the way a worklet loads them, with what a worklet has around it.
async function load(port: () => unknown = () => ({})) {
    const made: Record<string, new () => Processor> = {}
    vi.stubGlobal('sampleRate', 44100)
    vi.stubGlobal('currentTime', 1)
    vi.stubGlobal(
        'AudioWorkletProcessor',
        class {
            get port() {
                return port()
            }
        },
    )
    vi.stubGlobal('registerProcessor', (name: string, processor: new () => Processor) => (made[name] = processor))
    vi.resetModules()
    for (const file of ['superdough/worklets.mjs', '../../src/engine/supersaw.worklet.js']) await import(/* @vite-ignore */ file)
    return made
}

// The voices start where chance puts them, so chance is made the same for both.
function sameChance() {
    let seed = 7
    vi.spyOn(Math, 'random').mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647)
}

const note = (begin: number, more: Record<string, number[]> = {}) => ({ begin: [begin], end: [begin + 2], frequency: [220], panspread: [0.4], freqspread: [0.2], detune: [0], voices: [5], ...more })

function blocks(processor: Processor, params: Record<string, number[]>, count: number): number[] {
    const heard: number[] = []
    for (let block = 0; block < count; block++) {
        const out = [[new Float32Array(128), new Float32Array(128)]]
        processor.process([], out, params)
        heard.push(...out[0][0], ...out[0][1])
    }
    return heard
}

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('the supersaw of this app', () => {
    it('sounds sample for sample as the one of superdough does', async () => {
        const made = await load()
        for (const params of [note(0.5), note(0.5, { voices: [1] }), note(0.5, { voices: [7], detune: [30], freqspread: [0.6], panspread: [1] })]) {
            sameChance()
            const theirs = blocks(new made['supersaw-oscillator'](), params, 4)
            sameChance()
            const ours = blocks(new made['weft-supersaw'](), params, 4)
            expect(theirs.some((sample) => sample !== 0)).toBe(true)
            expect(ours).toEqual(theirs)
        }
    })

    it('never touches its message port, and starts its voices afresh when a node is given its next note', async () => {
        const made = await load(() => {
            throw new Error('the port was touched')
        })
        const used = new made['weft-supersaw']()
        sameChance()
        blocks(used, note(0.5), 3)
        sameChance()
        const again = blocks(used, note(0.7), 3)
        sameChance()
        const fresh = blocks(new made['weft-supersaw'](), note(0.7), 3)
        expect(again).toEqual(fresh)
    })
})
