import { describe, expect, it } from 'vitest'
import { drumFor, readKey } from '../../src/library/midi'

describe('what a MIDI keyboard says', () => {
    it('is a key pressed, with how hard, or a key let go', () => {
        expect(readKey(new Uint8Array([0x90, 60, 127]))).toEqual({ kind: 'down', note: 60, force: 1 })
        expect(readKey(new Uint8Array([0x93, 64, 64]))).toEqual({ kind: 'down', note: 64, force: 64 / 127 })
        expect(readKey(new Uint8Array([0x80, 60, 0]))).toEqual({ kind: 'up', note: 60 })
    })

    it('a key pressed with no force is a key let go, as many keyboards say it', () => {
        expect(readKey(new Uint8Array([0x90, 60, 0]))).toEqual({ kind: 'up', note: 60 })
    })

    it('anything else is none of the keys: a knob, a wheel, half a message', () => {
        expect(readKey(new Uint8Array([0xb0, 1, 64]))).toBeNull()
        expect(readKey(new Uint8Array([0xe0, 0, 64]))).toBeNull()
        expect(readKey(new Uint8Array([0x90, 60]))).toBeNull()
    })
})

describe('a pad or a key on a drum grid', () => {
    const rows = ['bd', 'hh', 'sd', 'my_clap']

    it('plays the sound its note stands for on every drum machine, when the grid has it', () => {
        expect(drumFor(36, rows)).toBe('bd')
        expect(drumFor(38, rows)).toBe('sd')
        expect(drumFor(42, rows)).toBe('hh')
    })

    it('else plays the row it counts to, from the note of the kick up', () => {
        expect(drumFor(39, rows)).toBe('my_clap')
        expect(drumFor(37, rows)).toBe('hh')
        expect(drumFor(60, rows)).toBeNull()
    })
})
