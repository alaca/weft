import { describe, expect, it } from 'vitest'
import { aboutText, arrivedAt, cleanName, cleanSay, digestOf, listAddress, packPiece, PIECE, piecesOf, readInvite, readOpenJams, readPiece, showInvite } from '../../src/jam/protocol'
import { soundRenames } from '../../src/library/songfile'

describe('invites', () => {
    it('are shown in two halves', () => {
        expect(showInvite('7KQM2D')).toBe('7KQ-M2D')
    })

    it('are read however they were typed', () => {
        expect(readInvite('7KQ-M2D')).toBe('7KQM2D')
        expect(readInvite(' 7kqm2d ')).toBe('7KQM2D')
        expect(readInvite('7kq m2d')).toBe('7KQM2D')
    })

    it('are found at the end of a line of text', () => {
        expect(readInvite('Join my jam in Weft: 7KQ-M2D')).toBe('7KQM2D')
        expect(readInvite('code is\n7KQ-M2D\n')).toBe('7KQM2D')
    })

    it('are not found in words, or in letters that an invite never has', () => {
        expect(readInvite('hello')).toBeNull()
        expect(readInvite('wonderfus')).toBeNull()
        expect(readInvite('7KQ-M2')).toBeNull()
        expect(readInvite('7KQ-M2O')).toBeNull()
        expect(readInvite('7KQ-M21')).toBeNull()
        expect(readInvite('')).toBeNull()
    })
})

describe('the list of open jams', () => {
    it('is read from where the relay is reached', () => {
        expect(listAddress('ws://127.0.0.1:5190')).toBe('http://127.0.0.1:5190/jams')
        expect(listAddress('wss://jam.example.org/')).toBe('https://jam.example.org/jams')
    })

    it('is taken as it comes, without what is not a jam', () => {
        const mara = { id: 'a1b2c3d4e5f6', name: '  Mara  ', bpm: 84.2, patterns: 6, since: 1700000000000 }
        expect(readOpenJams({ jams: [mara, null, 'x', { id: 'NOT-AN-ID', name: 'x' }, { id: 'a1b2c3d4e5f7', name: ' ' }, { id: 'a1b2c3d4e5f8', name: 'x'.repeat(40), bpm: 'fast', patterns: -3 }] })).toEqual([
            { id: 'a1b2c3d4e5f6', name: 'Mara', bpm: 84, patterns: 6, since: 1700000000000 },
            { id: 'a1b2c3d4e5f8', name: 'x'.repeat(24), bpm: null, patterns: 0, since: 0 },
        ])
        expect(readOpenJams(null)).toEqual([])
        expect(readOpenJams({ jams: 'many' })).toEqual([])
    })

    it('says of a jam how fast its song is and how many patterns it has', () => {
        expect(aboutText({ bpm: 84, patterns: 6 })).toBe('84 bpm, 6 patterns')
        expect(aboutText({ bpm: 132, patterns: 1 })).toBe('132 bpm, 1 pattern')
        expect(aboutText({ bpm: null, patterns: 3 })).toBe('3 patterns')
        expect(aboutText({ bpm: 120, patterns: 0 })).toBe('Just started')
    })
})

describe('names and what is said', () => {
    it('are trimmed, kept on one line and cut to their length', () => {
        expect(cleanName('  Mara \n K ')).toBe('Mara K')
        expect(cleanName('x'.repeat(60))).toHaveLength(24)
        expect(cleanSay('  hello\nthere  ')).toBe('hello there')
        expect(cleanSay('y'.repeat(900))).toHaveLength(500)
    })
})

describe('pieces of a sound', () => {
    it('come out as they went in', () => {
        const bytes = Uint8Array.from([0, 1, 2, 250, 255])
        const frame = packPiece({ name: 'my_take', part: 2, parts: 5, bytes })
        const read = readPiece(frame.buffer as ArrayBuffer)
        expect(read).toMatchObject({ name: 'my_take', part: 2, parts: 5 })
        expect([...read!.bytes]).toEqual([...bytes])
    })

    it('are as many as it takes, and at least one', () => {
        expect(piecesOf(0)).toBe(1)
        expect(piecesOf(PIECE)).toBe(1)
        expect(piecesOf(PIECE + 1)).toBe(2)
        expect(piecesOf(PIECE * 3)).toBe(3)
    })

    it('are refused when they do not say what they are', () => {
        expect(readPiece(new Uint8Array([0]).buffer)).toBeNull()
        expect(readPiece(new Uint8Array([0, 9, 1, 2]).buffer)).toBeNull()
        const wrong = packPiece({ name: 'x', part: 4, parts: 2, bytes: new Uint8Array(1) })
        expect(readPiece(wrong.buffer as ArrayBuffer)).toBeNull()
        const text = new TextEncoder().encode('not json')
        expect(readPiece(Uint8Array.from([0, text.length, ...text]).buffer)).toBeNull()
    })
})

describe('digestOf', () => {
    it('says the same of the same sound and something else of another', async () => {
        const one = Uint8Array.from([1, 2, 3]).buffer
        const same = Uint8Array.from([1, 2, 3]).buffer
        const other = Uint8Array.from([1, 2, 4]).buffer
        expect(await digestOf(one)).toBe(await digestOf(same))
        expect(await digestOf(one)).not.toBe(await digestOf(other))
        expect(await digestOf(one)).toMatch(/^[0-9a-f]{24}$/)
    })
})

describe('arrivedAt', () => {
    it('adds the bars that went by while the word was on its way', () => {
        expect(arrivedAt(4, 0, 120)).toBe(4)
        expect(arrivedAt(4, 200, 120)).toBeCloseTo(4.05)
        expect(arrivedAt(4, 200, 240)).toBeCloseTo(4.1)
    })
})

describe('soundRenames', () => {
    it('finds a sound wherever its name stands as a whole word', () => {
        const code = 'a: s("take")\nb: s("take_2 take")\nc: s("retake")'
        expect(soundRenames(code, 'take', 'take_3')).toEqual([
            { from: 6, to: 10, insert: 'take_3' },
            { from: 26, to: 30, insert: 'take_3' },
        ])
        expect(soundRenames(code, 'missing', 'x')).toEqual([])
    })
})
