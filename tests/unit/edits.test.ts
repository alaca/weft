import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { addCall, applyEdit, removeCall, setNumber, toggleMute } from '../../src/song/edits'

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
        const once = applyEdit(code, toggleMute(analyze(code).patterns[0]))
        const twice = applyEdit(once, toggleMute(analyze(once).patterns[0]))
        expect(once).not.toBe(code)
        expect(twice).toBe(code)
    })

    it('mutes an anonymous pattern', () => {
        const code = '$: s("hh*8")'
        expect(applyEdit(code, toggleMute(first(code)))).toBe('_$: s("hh*8")')
    })
})

describe('setNumber', () => {
    it('rewrites a plain number', () => {
        const code = 'x: s("bd").lpq(8)'
        const arg = first(code).calls[1].args[0]
        if (arg.kind !== 'number') throw new Error('expected a number')
        expect(applyEdit(code, setNumber(arg, '12.5'))).toBe('x: s("bd").lpq(12.5)')
    })

    it('rewrites only the value of a slider', () => {
        const code = 'x: note("c").lpf(slider(1200, 200, 4000))'
        const arg = first(code).calls[1].args[0]
        if (arg.kind !== 'slider') throw new Error('expected a slider')
        expect(applyEdit(code, setNumber(arg, '990'))).toBe('x: note("c").lpf(slider(990, 200, 4000))')
    })
})

describe('addCall', () => {
    it('appends a new line with the indent the pattern already uses', () => {
        const code = 'bass: note("c")\n    .s("sawtooth")'
        expect(applyEdit(code, addCall(code, first(code), '.delay(slider(0.25, 0, 1))'))).toBe(
            'bass: note("c")\n    .s("sawtooth")\n    .delay(slider(0.25, 0, 1))',
        )
    })

    it('uses two spaces when the pattern is on one line', () => {
        const code = 'bass: note("c")'
        expect(applyEdit(code, addCall(code, first(code), '.room(slider(0.3, 0, 1))'))).toBe('bass: note("c")\n  .room(slider(0.3, 0, 1))')
    })

    it('adds to the end of its own pattern, not the end of the file', () => {
        const code = 'bass: note("c")\n  .s("sawtooth")\n\nlead: note("e")'
        expect(applyEdit(code, addCall(code, first(code), '.pan(slider(0.5, 0, 1))'))).toBe(
            'bass: note("c")\n  .s("sawtooth")\n  .pan(slider(0.5, 0, 1))\n\nlead: note("e")',
        )
    })
})

describe('removeCall', () => {
    it('removes a call together with its line', () => {
        const code = 'bass: note("c")\n  .s("sawtooth")\n  .lpq(8)\n  .room(0.2)'
        expect(applyEdit(code, removeCall(first(code).calls[2]))).toBe('bass: note("c")\n  .s("sawtooth")\n  .room(0.2)')
    })

    it('removes a call written on the same line', () => {
        const code = 'bass: note("c").lpq(8).room(0.2)'
        expect(applyEdit(code, removeCall(first(code).calls[1]))).toBe('bass: note("c").room(0.2)')
    })
})
