import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { applyEdit, toggleMute } from '../../src/song/edits'

const first = (code: string) => analyze(code).patterns[0]

describe('toggleMute', () => {
    it('adds an underscore in front of the label', () => {
        const code = 'drums: s("bd*4")'
        expect(applyEdit(code, toggleMute(first(code)))).toBe('_drums: s("bd*4")')
    })

    it('removes a leading underscore', () => {
        const code = '_drums: s("bd*4")'
        expect(applyEdit(code, toggleMute(first(code)))).toBe('drums: s("bd*4")')
    })

    it('removes a trailing underscore', () => {
        const code = 'drums_: s("bd*4")'
        expect(applyEdit(code, toggleMute(first(code)))).toBe('drums: s("bd*4")')
    })

    it('gives back the original text when applied twice', () => {
        const code = 'setcpm(30)\n\nbass: note("c2 e2")\n  .s("sawtooth")\n'
        const block = analyze(code).patterns[0]
        const once = applyEdit(code, toggleMute(block))
        const twice = applyEdit(once, toggleMute(analyze(once).patterns[0]))
        expect(once).not.toBe(code)
        expect(twice).toBe(code)
    })

    it('mutes an anonymous pattern', () => {
        const code = '$: s("hh*8")'
        expect(applyEdit(code, toggleMute(first(code)))).toBe('_$: s("hh*8")')
    })
})
