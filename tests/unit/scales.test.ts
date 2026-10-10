import { describe, expect, it } from 'vitest'
import { chordOn, inKey, keyText, nearestInKey, readKey, stepInKey, writeKey, type Key } from '../../src/song/scales'

const A_MINOR: Key = { root: 9, kind: 'minor' }
const C_PENTATONIC: Key = { root: 0, kind: 'majorPentatonic' }

describe('inKey', () => {
    it('knows the notes of a key in every octave', () => {
        expect([57, 59, 60, 62, 64, 65, 67, 69].every((midi) => inKey(midi, A_MINOR))).toBe(true)
        expect([58, 61, 63, 66, 68].some((midi) => inKey(midi, A_MINOR))).toBe(false)
        expect(inKey(21, A_MINOR)).toBe(true)
        expect(inKey(1, A_MINOR)).toBe(false)
    })

    it('lets every note through when there is no key', () => {
        expect(inKey(61, null)).toBe(true)
    })
})

describe('nearestInKey', () => {
    it('keeps a note of the key and moves any other to the closest one, the lower of two', () => {
        expect(nearestInKey(60, A_MINOR)).toBe(60)
        expect(nearestInKey(61, A_MINOR)).toBe(60)
        expect(nearestInKey(66, A_MINOR)).toBe(65)
        expect(nearestInKey(65, C_PENTATONIC)).toBe(64)
        expect(nearestInKey(71, C_PENTATONIC)).toBe(72)
        expect(nearestInKey(61, null)).toBe(61)
    })
})

describe('stepInKey', () => {
    it('goes to the next note of the key', () => {
        expect(stepInKey(60, 1, A_MINOR)).toBe(62)
        expect(stepInKey(60, -1, A_MINOR)).toBe(59)
        expect(stepInKey(64, 1, C_PENTATONIC)).toBe(67)
        expect(stepInKey(60, 1, null)).toBe(61)
    })
})

describe('keeping a key', () => {
    it('writes it and reads it back', () => {
        expect(writeKey(A_MINOR)).toBe('9:minor')
        expect(readKey('9:minor')).toEqual(A_MINOR)
        expect(writeKey(null)).toBeNull()
    })

    it('reads nothing from what is not a key', () => {
        expect(readKey('12:minor')).toBeNull()
        expect(readKey('3:lydian')).toBeNull()
        expect(readKey(undefined)).toBeNull()
    })

    it('says it in words', () => {
        expect(keyText(A_MINOR)).toBe('A minor')
        expect(keyText({ root: 6, kind: 'blues' })).toBe('F# blues')
    })
})

describe('chordOn', () => {
    it('stacks every other note of the key on the note', () => {
        expect(chordOn(57, A_MINOR)).toEqual([57, 60, 64])
        expect(chordOn(60, A_MINOR)).toEqual([60, 64, 67])
        expect(chordOn(59, A_MINOR)).toEqual([59, 62, 65])
    })

    it('starts from the closest note of the key', () => {
        expect(chordOn(61, A_MINOR)).toEqual([60, 64, 67])
        expect(chordOn(60, C_PENTATONIC)).toEqual([60, 64, 69])
    })
})
