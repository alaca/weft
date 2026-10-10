import { describe, expect, it } from 'vitest'
import { encodeWav, fileName, levelFor, peakOf, soundingLength } from '../../src/library/wav'

const text = (bytes: Uint8Array, at: number, length: number) => String.fromCharCode(...bytes.slice(at, at + length))

describe('encodeWav', () => {
    const left = Float32Array.from([0, 0.5, -0.5, 1, -1, 2])
    const right = Float32Array.from([0, 0.25, -0.25, 0, 0, -2])
    const bytes = encodeWav([left, right], 44100)
    const view = new DataView(bytes.buffer)

    it('writes the head of a 16 bit stereo file', () => {
        expect(text(bytes, 0, 4)).toBe('RIFF')
        expect(text(bytes, 8, 8)).toBe('WAVEfmt ')
        expect(text(bytes, 36, 4)).toBe('data')
        expect(view.getUint32(4, true)).toBe(36 + 24)
        expect(view.getUint16(20, true)).toBe(1)
        expect(view.getUint16(22, true)).toBe(2)
        expect(view.getUint32(24, true)).toBe(44100)
        expect(view.getUint32(28, true)).toBe(44100 * 4)
        expect(view.getUint16(32, true)).toBe(4)
        expect(view.getUint16(34, true)).toBe(16)
        expect(view.getUint32(40, true)).toBe(24)
        expect(bytes.length).toBe(44 + 24)
    })

    it('puts the channels side by side and keeps what is too loud inside the range', () => {
        const sample = (at: number) => view.getInt16(44 + at * 2, true)
        expect([sample(0), sample(1)]).toEqual([0, 0])
        expect([sample(2), sample(3)]).toEqual([16384, 8192])
        expect([sample(4), sample(5)]).toEqual([-16383, -8192])
        expect(sample(6)).toBe(32767)
        expect(sample(8)).toBe(-32767)
        expect([sample(10), sample(11)]).toEqual([32767, -32767])
    })

    it('can write only the start, turned down', () => {
        const short = encodeWav([left, right], 48000, 2, 0.5)
        expect(short.length).toBe(44 + 8)
        expect(new DataView(short.buffer).getInt16(44 + 4, true)).toBe(8192)
    })
})

describe('soundingLength', () => {
    it('ends a little after the last sound in any channel', () => {
        const left = new Float32Array(1000)
        const right = new Float32Array(1000)
        left[100] = 0.3
        right[400] = -0.2
        expect(soundingLength([left, right], 100)).toBe(421)
    })

    it('never cuts into the part that has to stay, nor runs past the end', () => {
        const quiet = new Float32Array(1000)
        expect(soundingLength([quiet], 100, 600)).toBe(600)
        quiet[990] = 1
        expect(soundingLength([quiet], 100)).toBe(1000)
    })
})

describe('levels', () => {
    it('finds the loudest sample', () => {
        expect(peakOf([Float32Array.from([0.1, -0.7]), Float32Array.from([0.4, 0.2])])).toBeCloseTo(0.7)
    })

    it('turns down only what is louder than full level', () => {
        expect(levelFor(0.8)).toBe(1)
        expect(levelFor(1.32) * 1.32).toBeCloseTo(0.99)
    })
})

describe('fileName', () => {
    it('keeps a plain name and drops what a file name cannot hold', () => {
        expect(fileName('Night bus', 'wav')).toBe('Night bus.wav')
        expect(fileName('a/b: c?  "d"', 'js')).toBe('a b c d.js')
        expect(fileName('   ', 'js')).toBe('Song.js')
        expect(fileName('..hidden', 'wav')).toBe('hidden.wav')
    })
})
