import { afterEach, describe, expect, it, vi } from 'vitest'
import { openLine } from '../../src/jam/line'
import { aboutText, arrivedAt, cleanName, cleanSay, digestOf, HELD_UP, heldUp, listAddress, packPiece, PIECE, piecesOf, quickest, readInvite, readOpenJams, readPiece, showInvite, TRIPS_KEPT, withTrip } from '../../src/jam/protocol'
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
        expect(readInvite('Join my jam in Weft Loom: 7KQ-M2D')).toBe('7KQM2D')
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

describe('a long sound on the line', () => {
    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it('has no more than two pieces waiting there, so that what is said is not far behind', async () => {
        vi.useFakeTimers()
        const handed: (string | Uint8Array)[] = []
        let carried = 0
        class FakeSocket {
            static OPEN = 1
            static made: FakeSocket
            readyState = 1
            bufferedAmount = 0
            onopen: (() => void) | null = null
            constructor() {
                FakeSocket.made = this
                queueMicrotask(() => this.onopen?.())
            }
            send(data: string | Uint8Array) {
                handed.push(data)
                this.bufferedAmount += data.length
            }
            close() {}
        }
        // The line has carried the next thing that waited in it.
        const carry = () => (FakeSocket.made.bufferedAmount -= handed[carried++].length)
        vi.stubGlobal('WebSocket', FakeSocket)
        vi.stubGlobal('window', globalThis)

        const line = await openLine('ws://relay', { message() {}, bytes() {}, closed() {} })
        const bytes = new Uint8Array(PIECE * 6)
        const parts = piecesOf(bytes.length)
        const sound = (async () => {
            for (let part = 0; part < parts; part++) await line.sendBytes(packPiece({ name: 'take', part, parts, bytes: bytes.subarray(part * PIECE, (part + 1) * PIECE) }))
        })()
        await vi.advanceTimersByTimeAsync(200)
        expect(handed).toHaveLength(2)

        line.send({ t: 'tell', d: { k: 'say', text: 'hello' } })
        expect(typeof handed[2]).toBe('string')

        const pieces = (some: (string | Uint8Array)[]) => some.filter((one) => typeof one !== 'string').length
        while (carried < handed.length) {
            carry()
            await vi.advanceTimersByTimeAsync(20)
            expect(pieces(handed.slice(carried))).toBeLessThanOrEqual(2)
        }
        await sound
        expect(pieces(handed)).toBe(parts)
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

describe('how a line is timed', () => {
    it('takes the quickest of the last few round trips for what the line takes', () => {
        expect(quickest([])).toBe(0)
        expect(quickest([141, 12, 9, 30])).toBe(9)
        let trips: number[] = []
        for (const took of [5, 90, 91, 92, 93, 94, 95, 96, 97]) trips = withTrip(trips, took)
        expect(trips).toHaveLength(TRIPS_KEPT)
        expect(quickest(trips)).toBe(90)
    })

    it('leaves out an answer that waited in a busy window', () => {
        const trips = [141, 6, 9, 12, 174]
        expect(heldUp(12, trips)).toBe(false)
        expect(heldUp(6 + HELD_UP, trips)).toBe(false)
        expect(heldUp(101, trips)).toBe(true)
        expect(heldUp(174, trips)).toBe(true)
    })

    it('takes a line that has really become slower for what it is, a few pings later', () => {
        let trips = [8, 9, 7, 8]
        const left: boolean[] = []
        for (let n = 0; n < TRIPS_KEPT; n++) {
            const took = 120 + (n % 3)
            trips = withTrip(trips, took)
            left.push(heldUp(took, trips))
        }
        expect(left).toEqual([...Array<boolean>(TRIPS_KEPT - 1).fill(true), false])
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
