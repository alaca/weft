import { describe, expect, it } from 'vitest'
import { encodeMp3 } from '../../src/library/mp3'
import { onsetOf, shrinkSounds, withoutLead, type Decoded } from '../../src/library/shrink'
import type { PackedSound } from '../../src/library/songfile'

const RATE = 1000
const sound = (samples: number[]): Decoded => ({ channels: [Float32Array.from(samples)], sampleRate: RATE })
const silence = (count: number) => Array<number>(count).fill(0)

describe('onsetOf', () => {
    it('is the first moment a sound is a tenth as loud as it ever gets', () => {
        expect(onsetOf(sound([...silence(50), 0.05, 0.2, 1, 0.5]))).toBe(0.051)
        expect(onsetOf(sound([0.5, 1]))).toBe(0)
        expect(onsetOf(sound(silence(20)))).toBe(0)
    })

    it('looks at every channel', () => {
        expect(onsetOf({ channels: [Float32Array.from([0, 0, 0, 1]), Float32Array.from([0, 1, 0, 0])], sampleRate: RATE })).toBe(0.001)
    })
})

describe('withoutLead', () => {
    it('takes off what stands in front of where the sound used to start', () => {
        const late = sound([...silence(30), 1, 0.5, 0.25])
        const cut = withoutLead(late, 0.005)
        expect(cut?.channels[0].length).toBe(8)
        expect(onsetOf(cut!)).toBe(0.005)
    })

    it('leaves alone a sound that starts where it did, or earlier', () => {
        expect(withoutLead(sound([...silence(5), 1]), 0.005)).toBeNull()
        expect(withoutLead(sound([1]), 0.005)).toBeNull()
    })
})

describe('shrinkSounds', () => {
    const packed = (name: string, bytes: number): PackedSound => ({ name, file: `${name}.wav`, type: 'audio/wav', seconds: 1, data: new Uint8Array(bytes) })
    const sizeWith = (sounds: PackedSound[]) => 100 + sounds.reduce((sum, one) => sum + one.data.length, 0)
    const decode = async () => sound([...silence(10), 1])
    const encodeTo = (sizes: Record<number, number>, seen: number[] = []) => async (_: Decoded, kbps: number) => {
        seen.push(kbps)
        return new Uint8Array(sizes[kbps])
    }

    it('leaves a file that already fits as it is, without making a single MP3', async () => {
        const seen: number[] = []
        const sounds = [packed('a', 400)]
        const result = await shrinkSounds(sounds, sizeWith, decode, encodeTo({}, seen), 1000)
        expect(result).toEqual({ sounds, fits: true, kbps: null })
        expect(seen).toEqual([])
    })

    it('takes the best quality at which the whole file fits', async () => {
        const result = await shrinkSounds([packed('a', 3000), packed('b', 3000)], sizeWith, decode, encodeTo({ 128: 600, 96: 440, 64: 300 }), 1000)
        expect(result.fits).toBe(true)
        expect(result.kbps).toBe(96)
        expect(result.sounds.map((one) => [one.name, one.file, one.type, one.data.length, one.onset])).toEqual([
            ['a', 'a.mp3', 'audio/mpeg', 440, 0.01],
            ['b', 'b.mp3', 'audio/mpeg', 440, 0.01],
        ])
    })

    it('says so when the file does not fit at the lowest quality either, and hands over the smallest', async () => {
        const result = await shrinkSounds([packed('a', 9000)], sizeWith, decode, encodeTo({ 128: 4000, 96: 3000, 64: 2000 }), 1000)
        expect(result.fits).toBe(false)
        expect(result.kbps).toBe(64)
        expect(result.sounds[0].data.length).toBe(2000)
    })

    it('leaves a sound alone that an MP3 would not make smaller, or that cannot be read', async () => {
        const small = packed('small', 50)
        const broken = packed('broken', 5000)
        const result = await shrinkSounds([small, broken, packed('big', 5000)], sizeWith, async (bytes) => (bytes === broken.data ? null : sound([1])), encodeTo({ 128: 200, 96: 200, 64: 200 }), 6000)
        expect(result.sounds[0]).toBe(small)
        expect(result.sounds[1]).toBe(broken)
        expect(result.sounds[2].type).toBe('audio/mpeg')
        expect(result.fits).toBe(true)
    })

    // Two seconds of a tone with noise on it. An MP3 of that has next to no bytes that are 0;
    // one of silence is nearly all 0.
    const noisy = (rate: number, count: number): Decoded => {
        let seed = 1
        const channel = Float32Array.from({ length: rate * 2 }, (_, at) => {
            seed = (seed * 16807) % 2147483647
            return Math.sin((at / rate) * 2 * Math.PI * 220) * 0.5 + (seed / 2147483647 - 0.5) * 0.3
        })
        return { channels: Array.from({ length: count }, () => channel), sampleRate: rate }
    }
    const zeros = (bytes: Uint8Array) => bytes.reduce((sum, byte) => sum + (byte === 0 ? 1 : 0), 0) / bytes.length

    it('makes MP3s that hold the sound at every quality, with the encoder the app uses', async () => {
        for (const rate of [44100, 48000, 88200]) {
            for (const count of [2, 1]) {
                for (const [kbps, limit] of [[128, 40000], [96, 28000], [64, 20000]]) {
                    const asked: (number | undefined)[] = []
                    const read = async (_: Uint8Array, wanted?: number) => (asked.push(wanted), noisy(wanted ?? rate, count))
                    const result = await shrinkSounds([packed('take', 400000)], sizeWith, read, (sound, step) => encodeMp3(sound.channels, sound.sampleRate, step), limit)
                    expect([rate, count, result.kbps]).toEqual([rate, count, kbps])
                    expect(zeros(result.sounds[0].data)).toBeLessThan(0.2)
                    // A sound of one channel at a rate an MP3 can have is read once, as it is.
                    if (count === 1 && rate <= 48000) expect(asked).toEqual([undefined])
                }
            }
        }
    }, 60000)

    it('leaves a sound as it is at a quality it cannot be read for, and never hands it over at another rate', async () => {
        const seen: [number, number][] = []
        const both = Float32Array.from([0, 1])
        const read = async (_: Uint8Array, wanted?: number) => (wanted ? null : { channels: [both, both], sampleRate: 44100 })
        const big = packed('big', 5000)
        const result = await shrinkSounds([big], sizeWith, read, async (heard, kbps) => (seen.push([kbps, heard.sampleRate]), new Uint8Array(2000)), 1000)
        expect(seen).toEqual([[128, 44100]])
        expect(result.fits).toBe(false)
        expect(result.sounds[0]).toBe(big)
    })
})
