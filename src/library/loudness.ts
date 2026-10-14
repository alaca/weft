// How loud a song sounds, the way streaming sites measure it (ITU-R BS.1770, EBU R128): the
// sound is weighted the way ears hear it, measured in blocks of 400 ms, and the blocks that are
// silent or far quieter than the rest are left out. Music is played there at about -14 LUFS.
export const STREAMING = -14
// Peaks are kept a decibel under full level, so that an MP3 made from it does not clip either.
const CEILING = 10 ** (-1 / 20)
// A song is not squeezed by more than this to be loud: past it, it would sound flattened.
const MOST_SQUEEZE = 10 ** (6 / 20)

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number }

// The two filters of the weighting, worked out for any sample rate as libebur128 does.
function weighting(sampleRate: number): [Biquad, Biquad] {
    let f0 = 1681.974450955533
    let q = 0.7071752369554196
    let k = Math.tan((Math.PI * f0) / sampleRate)
    const vh = 10 ** (3.999843853973347 / 20)
    const vb = vh ** 0.4996667741545416
    let a0 = 1 + k / q + k * k
    const shelf = { b0: (vh + (vb * k) / q + k * k) / a0, b1: (2 * (k * k - vh)) / a0, b2: (vh - (vb * k) / q + k * k) / a0, a1: (2 * (k * k - 1)) / a0, a2: (1 - k / q + k * k) / a0 }
    f0 = 38.13547087602444
    q = 0.5003270373238773
    k = Math.tan((Math.PI * f0) / sampleRate)
    a0 = 1 + k / q + k * k
    const low = { b0: 1, b1: -2, b2: 1, a1: (2 * (k * k - 1)) / a0, a2: (1 - k / q + k * k) / a0 }
    return [shelf, low]
}

// The loudness of the first `length` samples, in LUFS. Null when nothing in it sounds.
export function loudnessOf(channels: Float32Array[], sampleRate: number, length = channels[0]?.length ?? 0): number | null {
    const step = Math.round(sampleRate * 0.1)
    const steps = Math.floor(length / step)
    if (steps < 4) return null
    const sums = new Float64Array(steps)
    const filters = weighting(sampleRate)
    for (const channel of channels) {
        const states = filters.map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0 }))
        for (let at = 0; at < steps * step; at++) {
            let value = channel[at]
            for (let f = 0; f < 2; f++) {
                const c = filters[f]
                const s = states[f]
                const y = c.b0 * value + c.b1 * s.x1 + c.b2 * s.x2 - c.a1 * s.y1 - c.a2 * s.y2
                s.x2 = s.x1
                s.x1 = value
                s.y2 = s.y1
                s.y1 = y
                value = y
            }
            sums[Math.floor(at / step)] += value * value
        }
    }
    const blocks: number[] = []
    for (let at = 0; at + 4 <= steps; at++) blocks.push((sums[at] + sums[at + 1] + sums[at + 2] + sums[at + 3]) / (4 * step))
    const lufs = (power: number) => -0.691 + 10 * Math.log10(power)
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
    const heard = blocks.filter((power) => power > 0 && lufs(power) > -70)
    if (!heard.length) return null
    const gate = lufs(mean(heard)) - 10
    const kept = heard.filter((power) => lufs(power) > gate)
    return lufs(mean(kept))
}

// Every peak brought under the ceiling. The gain comes down smoothly in the few milliseconds
// before a peak and goes back up over a tenth of a second after it, the same for both channels.
function limit(channels: Float32Array[], sampleRate: number, ceiling: number) {
    const length = channels[0].length
    const needed = new Float32Array(length)
    for (let at = 0; at < length; at++) {
        let peak = 0
        for (const channel of channels) peak = Math.max(peak, Math.abs(channel[at]))
        needed[at] = peak > ceiling ? ceiling / peak : 1
    }
    // The least gain needed over the next five milliseconds, from the end back.
    const ahead = Math.max(1, Math.round(sampleRate * 0.005))
    const gain = new Float32Array(length)
    const window: number[] = []
    let head = 0
    for (let at = length - 1; at >= 0; at--) {
        while (window.length > head && needed[window[window.length - 1]] >= needed[at]) window.pop()
        window.push(at)
        while (window[head] > at + ahead) head++
        gain[at] = needed[window[head]]
    }
    const release = 1 - Math.exp(-1 / (0.08 * sampleRate))
    const attack = 1 - Math.exp(-1 / (0.002 * sampleRate))
    let level = 1
    for (let at = 0; at < length; at++) gain[at] = level = Math.min(gain[at], level + (1 - level) * release)
    level = 1
    for (let at = length - 1; at >= 0; at--) gain[at] = level = Math.min(gain[at], level + (1 - level) * attack)
    for (const channel of channels) for (let at = 0; at < length; at++) channel[at] *= gain[at]
}

export type MadeLoud = { channels: Float32Array[]; lufs: number; short: boolean }

// The first `length` samples made as loud as music on streaming sites, turned up or down as a
// whole and their peaks brought under the ceiling. `short` says it stopped short of that, as
// it would have had to be squeezed too much. Null when nothing sounds.
export function madeLoud(channels: Float32Array[], sampleRate: number, length = channels[0]?.length ?? 0): MadeLoud | null {
    const lufs = loudnessOf(channels, sampleRate, length)
    let peak = 0
    for (const channel of channels) for (let at = 0; at < length; at++) peak = Math.max(peak, Math.abs(channel[at]))
    if (lufs === null || !peak) return null
    const wanted = 10 ** ((STREAMING - lufs) / 20)
    const gain = Math.min(wanted, (CEILING * MOST_SQUEEZE) / peak)
    const made = channels.map((channel) => Float32Array.from(channel.subarray(0, length), (value) => value * gain))
    limit(made, sampleRate, CEILING)
    return { channels: made, lufs: loudnessOf(made, sampleRate, length) ?? STREAMING, short: gain < wanted * 0.99 }
}
