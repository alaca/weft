import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { STARTER } from '../../src/song/starter'

const first = (code: string) => analyze(code).patterns[0]

describe('calls', () => {
    it('lists the calls of a chain, source first', () => {
        const bass = analyze(STARTER).patterns[1]
        expect(bass.calls.map((c) => c.name)).toEqual(['note', 's', 'lpf', 'lpq', 'lpenv', 'decay'])
    })

    it('reads a plain number and where it is', () => {
        const code = 'x: s("bd").lpenv(3).decay(.18)'
        const [, lpenv, decay] = first(code).calls
        expect(lpenv.args[0]).toMatchObject({ kind: 'number', value: 3 })
        expect(decay.args[0]).toMatchObject({ kind: 'number', value: 0.18 })
        const arg = decay.args[0]
        expect(code.slice(arg.from, arg.to)).toBe('.18')
    })

    it('reads a negative number', () => {
        expect(first('x: s("bd").penv(-12)').calls[1].args[0]).toMatchObject({ kind: 'number', value: -12 })
    })

    it('reads a slider with its value range and limits', () => {
        const code = 'x: note("c").lpf(slider(1200, 200, 4000))'
        const arg = first(code).calls[1].args[0]
        expect(arg).toMatchObject({ kind: 'slider', value: 1200, min: 200, max: 4000 })
        if (arg.kind !== 'slider') throw new Error('expected a slider')
        expect(code.slice(arg.valueFrom, arg.valueTo)).toBe('1200')
        expect(code.slice(arg.from, arg.to)).toBe('slider(1200, 200, 4000)')
    })

    it('defaults slider limits to 0 and 1', () => {
        expect(first('x: s("bd").gain(slider(0.5))').calls[1].args[0]).toMatchObject({ kind: 'slider', value: 0.5, min: 0, max: 1 })
    })

    it('reads strings and marks everything else as other', () => {
        const calls = first('x: note("c").s("sawtooth").pan(sine.slow(4)).lastOf(4, y => y.rev())').calls
        expect(calls[1].args[0]).toMatchObject({ kind: 'string', value: 'sawtooth' })
        expect(calls[2].args[0].kind).toBe('other')
        expect(calls[3].args.map((a) => a.kind)).toEqual(['number', 'other'])
    })

    it('gives each call the range that removes it cleanly', () => {
        const code = 'bass: note("c")\n  .s("sawtooth")\n  .lpq(8)'
        const [note, , lpq] = first(code).calls
        expect(code.slice(note.from, note.to)).toBe('note("c")')
        expect(code.slice(lpq.from, lpq.to)).toBe('\n  .lpq(8)')
    })

    it('gives the range of the function name', () => {
        const code = 'bass: note("c").lpq(8)'
        const lpq = first(code).calls[1]
        expect(code.slice(lpq.nameFrom, lpq.nameTo)).toBe('lpq')
    })

    it('still names the sound', () => {
        expect(analyze(STARTER).patterns.map((p) => p.soundName)).toEqual(['RolandTR909', 'sawtooth', 'gm_epiano1', 'triangle'])
    })
})
