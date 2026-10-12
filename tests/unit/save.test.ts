import { describe, expect, it } from 'vitest'
import { textPieces } from '../../src/desktop/save'

const whole = (pieces: Uint8Array[]) => new TextDecoder().decode(Uint8Array.from(pieces.flatMap((piece) => [...piece])))

describe('a long text written in pieces', () => {
    it('is the same text again when the pieces are put together, wherever a piece ends', () => {
        const text = 'caf\u00e9 \u{1F3B9}\u{1F3B9} s("bd*4") \u{1D11E} end'
        for (let size = 1; size <= text.length + 1; size++) expect(whole([...textPieces(text, size)])).toBe(text)
        expect([...textPieces('', 4)]).toEqual([])
        expect([...textPieces('abcdefghij', 4)].map((piece) => piece.length)).toEqual([4, 4, 2])
    })
})
