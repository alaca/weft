import { afterEach, describe, expect, it, vi } from 'vitest'

type Processor = { process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, number[]>): boolean }

// Both are loaded the way a worklet loads them, with what a worklet has around it.
async function load(port: () => unknown = () => ({})) {
    const made: Record<string, new (options?: unknown) => Processor> = {}
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
    vi.stubGlobal('registerProcessor', (name: string, processor: new (options?: unknown) => Processor) => (made[name] = processor))
    vi.resetModules()
    for (const file of ['superdough/worklets.mjs', '../../src/engine/own.worklet.js']) await import(/* @vite-ignore */ file)
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

// Sound to put through an effect: some of it louder than full, and never the same twice.
function sound(channels: number, block: number): Float32Array[] {
    return Array.from({ length: channels }, (_, ch) => Float32Array.from({ length: 128 }, (_, n) => 1.3 * Math.sin(0.37 * (n + 128 * block) * (ch + 1)) * Math.cos(0.011 * (n + 128 * block))))
}

// What an effect gives for four blocks of sound and then, as when its note has ended, for none.
function through(effect: Processor, params: Record<string, number[]>, channels: number): { heard: number[]; alive: boolean[] } {
    const heard: number[] = []
    const alive: boolean[] = []
    for (let block = 0; block < 5; block++) {
        const out = Array.from({ length: channels }, () => new Float32Array(128))
        alive.push(effect.process([block < 4 ? sound(channels, block) : []], [out], params))
        for (const channel of out) heard.push(...channel)
    }
    return { heard, alive }
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

describe('the crush and the distortion of this app', () => {
    const rising = Array.from({ length: 128 }, (_, n) => n / 64)

    it('crush gives sample for sample what the one of superdough gives', async () => {
        const made = await load()
        for (const channels of [1, 2]) {
            for (const crush of [1, 4, 6.5, 8, 16, 0]) {
                const theirs = through(new made['crush-processor'](), { crush: [crush] }, channels)
                const ours = through(new made['weft-crush'](), { crush: [crush] }, channels)
                expect(theirs.heard.some((sample) => sample !== 0)).toBe(true)
                expect(ours).toEqual(theirs)
            }
        }
    })

    it('distortion gives sample for sample what the one of superdough gives, in every one of its kinds', async () => {
        const made = await load()
        const kinds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 'scurve', 'soft', 'hard', 'cubic', 'diode', 'asym', 'fold', 'sinefold', 'chebyshev', 'no such kind']
        for (const algorithm of kinds) {
            for (const params of [{ distort: [2], postgain: [0.32] }, { distort: [0], postgain: [1] }, { distort: rising, postgain: rising.map((value) => value / 3) }]) {
                for (const channels of [1, 2]) {
                    const theirs = through(new made['distort-processor']({ processorOptions: { algorithm } }), params, channels)
                    const ours = through(new made['weft-distort']({ processorOptions: { algorithm } }), params, channels)
                    expect(theirs.heard.some((sample) => sample !== 0)).toBe(true)
                    expect(ours).toEqual(theirs)
                }
            }
        }
    })
})
