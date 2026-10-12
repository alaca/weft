import { describe, expect, it } from 'vitest'
import { pieceStart } from '../../src/jam/capture'

const PIECE = 1024 / 48000

// A microphone that hands over a piece every 1,024 samples, to a window that stands still now
// and then: the pieces of a standstill all arrive when it is over.
function speak(seconds: number, standstills: [at: number, lasting: number][]) {
    let next = 0
    let now = 0
    let leftOut = 0
    for (let piece = 1; piece * PIECE <= seconds; piece++) {
        const made = piece * PIECE
        const held = standstills.find(([at, lasting]) => made >= at && made < at + lasting)
        now = held ? held[0] + held[1] : made
        const at = pieceStart(next, now)
        if (at === null) leftOut++
        else next = at + PIECE
    }
    return { behind: next - now, leftOut }
}

describe('the voice of the desktop app', () => {
    it('puts a piece right after the one before it, and a late one a little ahead of now', () => {
        expect(pieceStart(1.1, 1)).toBe(1.1)
        expect(pieceStart(0.9, 1)).toBeCloseTo(1.06)
        expect(pieceStart(0, 0)).toBeCloseTo(0.06)
    })

    it('leaves nothing out while the window is no later than it is in ordinary use', () => {
        const spoken = speak(10, [[2, 0.146], [4, 0.146], [6, 0.1], [8, 0.146]])
        expect(spoken.leftOut).toBe(0)
        expect(spoken.behind).toBeGreaterThan(0.15)
        expect(spoken.behind).toBeLessThan(0.25)
    })

    it('does not stay behind by the length of a long standstill', () => {
        for (const lasting of [0.3, 1, 3]) {
            const spoken = speak(lasting + 6, [[2, lasting]])
            expect(spoken.behind).toBeLessThan(0.3)
            expect(spoken.leftOut).toBeGreaterThan(0)
            expect(spoken.leftOut * PIECE).toBeLessThan(lasting)
        }
    })

    it('cuts the voice once for a long standstill, and not again at every ordinary one after it', () => {
        const once = speak(10, [[2, 1]])
        const after = speak(10, [[2, 1], [5, 0.146], [7, 0.146]])
        expect(after.leftOut).toBe(once.leftOut)
    })
})
