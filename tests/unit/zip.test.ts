import { describe, expect, it } from 'vitest'
import { crc32, zipWriter } from '../../src/library/zip'

const text = (value: string) => new TextEncoder().encode(value)

function whole(files: [string, Uint8Array][]): Uint8Array {
    const zip = zipWriter(new Date(2026, 9, 11, 12, 30, 40))
    const pieces = [...files.flatMap(([name, bytes]) => zip.add(name, bytes)), zip.end()]
    const out = new Uint8Array(pieces.reduce((sum, piece) => sum + piece.length, 0))
    let at = 0
    for (const piece of pieces) {
        out.set(piece, at)
        at += piece.length
    }
    return out
}

// Reads a zip back the way a program does: from the list at its end to each file.
function read(zip: Uint8Array): { name: string; bytes: Uint8Array; crc: number }[] {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    const end = zip.length - 22
    expect(view.getUint32(end, true)).toBe(0x06054b50)
    const count = view.getUint16(end + 10, true)
    let at = view.getUint32(end + 16, true)
    expect(at + view.getUint32(end + 12, true)).toBe(end)
    const files = []
    for (let n = 0; n < count; n++) {
        expect(view.getUint32(at, true)).toBe(0x02014b50)
        const size = view.getUint32(at + 24, true)
        const nameLength = view.getUint16(at + 28, true)
        const from = view.getUint32(at + 42, true)
        const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength))
        expect(view.getUint32(from, true)).toBe(0x04034b50)
        expect(new TextDecoder().decode(zip.subarray(from + 30, from + 30 + view.getUint16(from + 26, true)))).toBe(name)
        expect(view.getUint32(from + 18, true)).toBe(size)
        const start = from + 30 + view.getUint16(from + 26, true) + view.getUint16(from + 28, true)
        files.push({ name, bytes: zip.subarray(start, start + size), crc: view.getUint32(at + 16, true) })
        at += 46 + nameLength
    }
    return files
}

describe('a zip', () => {
    it('sums a file the way every zip program does', () => {
        expect(crc32(text('123456789'))).toBe(0xcbf43926)
        expect(crc32(new Uint8Array(0))).toBe(0)
    })

    it('holds each file whole, under its name, and says where each one is', () => {
        const files: [string, Uint8Array][] = [
            ['Night bus - drums.wav', new Uint8Array([1, 2, 3, 4, 5])],
            ['Night bus - bass.wav', new Uint8Array(70000).map((_, at) => at % 251)],
            ['Übung - später.wav', text('umlauts in a name')],
        ]
        const back = read(whole(files))
        expect(back.map((file) => file.name)).toEqual(files.map(([name]) => name))
        for (const [at, [, bytes]] of files.entries()) {
            expect(Array.from(back[at].bytes)).toEqual(Array.from(bytes))
            expect(back[at].crc).toBe(crc32(bytes))
        }
    })

    it('with nothing in it is still a zip', () => {
        expect(read(whole([]))).toEqual([])
    })

    it('takes nothing more once it is closed', () => {
        const zip = zipWriter()
        zip.end()
        expect(() => zip.add('late.wav', new Uint8Array(1))).toThrow('already closed')
    })
})
