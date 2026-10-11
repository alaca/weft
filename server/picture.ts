import { crc32, deflateSync } from 'node:zlib'
import { PICTURE, reach } from './pages'

// The picture a song is shown with wherever its address is pasted: its preview as a row of
// upright strokes, the way its page draws it, on the ground of the pages. There are no words in
// it, because there is nothing here to draw letters with.

// The ground and the strokes, as site.css names them: --vat and --linen.
const GROUND = [0x18, 0x18, 0x1a]
const STROKE = [0xec, 0xe6, 0xd6]
const STROKES = 100
// How far one stroke stands from the next, half of how thick it is, and how many dots one of
// the twenty units is that a stroke reaches up and down at most.
const APART = 10
const HALF = 2
const UNIT = 12

// One piece of a PNG: how long it is, what it is, what it holds, and a sum to check it by.
function piece(kind: string, held: Buffer): Buffer {
    const checked = Buffer.concat([Buffer.from(kind, 'latin1'), held])
    const made = Buffer.alloc(checked.length + 8)
    made.writeUInt32BE(held.length, 0)
    checked.copy(made, 4)
    made.writeUInt32BE(crc32(checked), checked.length + 4)
    return made
}

export function songPicture(peaks: number[]): Buffer {
    const { width, height } = PICTURE
    // A byte for every dot, saying how much of it a stroke covers, after a byte at the start
    // of each row that says the row is written as it is. The colours are listed for every such
    // amount, from the ground to the stroke, which is what makes the round ends smooth.
    const rows = Buffer.alloc(height * (width + 1))
    const first = (width - (STROKES - 1) * APART) / 2
    reach(peaks, STROKES).forEach((half, at) => {
        const middle = first + at * APART
        const top = height / 2 - half * UNIT
        const bottom = height / 2 + half * UNIT
        for (let row = Math.floor(top - HALF); row < bottom + HALF; row++) {
            const beyond = Math.max(top - row - 0.5, row + 0.5 - bottom, 0)
            for (let dot = Math.floor(middle - HALF); dot < middle + HALF; dot++) {
                const covered = Math.min(1, Math.max(0, HALF + 0.5 - Math.hypot(dot + 0.5 - middle, beyond)))
                rows[row * (width + 1) + 1 + dot] = Math.round(covered * 255)
            }
        }
    })
    const head = Buffer.alloc(13)
    head.writeUInt32BE(width, 0)
    head.writeUInt32BE(height, 4)
    // Eight bits a dot, each the place of its colour in the list.
    head.set([8, 3], 8)
    const colours = Buffer.from(Array.from({ length: 256 }, (_, much) => GROUND.map((ground, at) => Math.round(ground + ((STROKE[at] - ground) * much) / 255))).flat())
    return Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), piece('IHDR', head), piece('PLTE', colours), piece('IDAT', deflateSync(rows)), piece('IEND', Buffer.alloc(0))])
}
