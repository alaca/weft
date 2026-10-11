// Several files as one zip, written a file at a time so that only one of them has to be held
// at once. The files are put in as they are, not squeezed: they are audio, which a zip cannot
// make smaller, and every program that opens a zip can read them this way.
export type ZipWriter = {
    // What to write next for this file: its heading, then the file itself.
    add(name: string, bytes: Uint8Array): Uint8Array[]
    // The list that ends the zip. Nothing can be added after it.
    end(): Uint8Array
}

// A zip of this plain kind counts in 32 bits, so neither a file nor the whole can pass 4 GB.
export const ZIP_LIMIT = 0xffffffff
const MOST_FILES = 0xffff
const HEADING = 30
const LISTED = 46
const ENDING = 22
// The name is written as UTF-8, and says so.
const UTF8 = 0x0800

const TABLE = (() => {
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        table[n] = c >>> 0
    }
    return table
})()

export function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff
    for (let at = 0; at < bytes.length; at++) crc = TABLE[(crc ^ bytes[at]) & 0xff] ^ (crc >>> 8)
    return (crc ^ 0xffffffff) >>> 0
}

// A date the way a zip writes it: two seconds to a tick, years counted from 1980.
const stamp = (when: Date) => ({
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
    date: ((Math.max(1980, when.getFullYear()) - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
})

export function zipWriter(when = new Date()): ZipWriter {
    const { time, date } = stamp(when)
    const listed: { name: Uint8Array; crc: number; size: number; at: number }[] = []
    let written = 0
    let ended = false
    return {
        add(name, bytes) {
            if (ended) throw new Error('The zip is already closed.')
            const text = new TextEncoder().encode(name)
            if (listed.length >= MOST_FILES || bytes.length > ZIP_LIMIT || written + HEADING + text.length + bytes.length > ZIP_LIMIT) throw new Error('That is more than one zip can hold.')
            const crc = crc32(bytes)
            const heading = new Uint8Array(HEADING + text.length)
            const view = new DataView(heading.buffer)
            view.setUint32(0, 0x04034b50, true)
            view.setUint16(4, 20, true)
            view.setUint16(6, UTF8, true)
            view.setUint16(8, 0, true)
            view.setUint16(10, time, true)
            view.setUint16(12, date, true)
            view.setUint32(14, crc, true)
            view.setUint32(18, bytes.length, true)
            view.setUint32(22, bytes.length, true)
            view.setUint16(26, text.length, true)
            view.setUint16(28, 0, true)
            heading.set(text, HEADING)
            listed.push({ name: text, crc, size: bytes.length, at: written })
            written += heading.length + bytes.length
            return [heading, bytes]
        },
        end() {
            ended = true
            const size = listed.reduce((sum, file) => sum + LISTED + file.name.length, 0)
            const out = new Uint8Array(size + ENDING)
            const view = new DataView(out.buffer)
            let at = 0
            for (const file of listed) {
                view.setUint32(at, 0x02014b50, true)
                view.setUint16(at + 4, 20, true)
                view.setUint16(at + 6, 20, true)
                view.setUint16(at + 8, UTF8, true)
                view.setUint16(at + 10, 0, true)
                view.setUint16(at + 12, time, true)
                view.setUint16(at + 14, date, true)
                view.setUint32(at + 16, file.crc, true)
                view.setUint32(at + 20, file.size, true)
                view.setUint32(at + 24, file.size, true)
                view.setUint16(at + 28, file.name.length, true)
                view.setUint32(at + 42, file.at, true)
                out.set(file.name, at + LISTED)
                at += LISTED + file.name.length
            }
            view.setUint32(at, 0x06054b50, true)
            view.setUint16(at + 8, listed.length, true)
            view.setUint16(at + 10, listed.length, true)
            view.setUint32(at + 12, size, true)
            view.setUint32(at + 16, written, true)
            return out
        },
    }
}
