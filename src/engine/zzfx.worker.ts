import { buildSamples } from './zzfxSamples'

// Works a note out away from the window, and hands its samples back.
self.onmessage = (event: MessageEvent<{ id: number; params: number[]; sampleRate: number }>) => {
    const { id, params, sampleRate } = event.data
    const samples = Float32Array.from(buildSamples(params, sampleRate))
    ;(self as unknown as Worker).postMessage({ id, samples }, [samples.buffer])
}
