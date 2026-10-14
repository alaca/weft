import { describe, expect, it } from 'vitest'
import { loudnessOf, madeLoud, STREAMING } from '../../src/library/loudness'

// A tone in both channels, as the EBU tests have it: so many seconds of it at so many dB under full level.
const tone = (sampleRate: number, seconds: number, db: number, hertz = 1000) => {
    const amplitude = 10 ** (db / 20)
    const channel = Float32Array.from({ length: Math.round(sampleRate * seconds) }, (_, at) => amplitude * Math.sin((2 * Math.PI * hertz * at) / sampleRate))
    return [channel, Float32Array.from(channel)]
}
const peakOf = (channels: Float32Array[]) => Math.max(...channels.map((channel) => channel.reduce((most, value) => Math.max(most, Math.abs(value)), 0)))

describe('how loud a song is', () => {
    it('is measured as streaming sites do: a tone at -23 dB is -23 LUFS, at any sample rate', () => {
        for (const rate of [44100, 48000, 96000]) expect(loudnessOf(tone(rate, 20, -23), rate)).toBeCloseTo(-23, 1)
        expect(loudnessOf(tone(48000, 20, -33), 48000)).toBeCloseTo(-33, 1)
    })

    it('leaves out silence, and the parts far quieter than the rest', () => {
        const [left, right] = tone(48000, 10, -23)
        const longer = (channel: Float32Array, quiet: Float32Array) => Float32Array.from([...channel, ...quiet, ...new Float32Array(48000 * 10)])
        const [faint] = tone(48000, 10, -60)
        // To within a tenth, as the EBU's own tests allow: the blocks that hold the change count.
        expect(Math.abs(loudnessOf([longer(left, faint), longer(right, faint)], 48000)! + 23)).toBeLessThan(0.1)
        expect(loudnessOf([new Float32Array(48000 * 2), new Float32Array(48000 * 2)], 48000)).toBeNull()
    })
})

describe('a song made as loud as music on streaming sites', () => {
    it('is turned up or down to about -14 LUFS, with its peaks a decibel under full level', () => {
        for (const db of [-30, -6]) {
            const made = madeLoud(tone(44100, 10, db), 44100)!
            expect(made.lufs).toBeCloseTo(STREAMING, 0)
            expect(made.short).toBe(false)
            expect(peakOf(made.channels)).toBeLessThanOrEqual(10 ** (-1 / 20) + 1e-6)
        }
    })

    it('stops short rather than squeeze a song by more than 6 dB, and says so', () => {
        // A quiet tone with loud clicks in it: it would have to be squeezed hard to be loud.
        const channels = tone(44100, 10, -40)
        for (const channel of channels) for (let at = 1000; at < channel.length; at += 22050) channel[at] = 0.99
        const made = madeLoud(channels, 44100)!
        expect(made.short).toBe(true)
        expect(made.lufs).toBeLessThan(STREAMING - 3)
        expect(peakOf(made.channels)).toBeLessThanOrEqual(10 ** (-1 / 20) + 1e-6)
    })
})
