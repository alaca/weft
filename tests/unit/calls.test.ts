import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { STARTER } from '../songs'

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

    it('reads how loud a pattern is as a call of its own, given the number', () => {
        const code = 'x: s("bd").gain(0.5).mul(postgain(slider(0.8, 0, 1.5))).room(0.2)'
        const [, gain, volume, room] = first(code).calls
        expect([gain.name, volume.name, room.name]).toEqual(['gain', 'volume', 'room'])
        expect(volume.args).toHaveLength(1)
        expect(volume.args[0]).toMatchObject({ kind: 'slider', value: 0.8, min: 0, max: 1.5 })
        expect(code.slice(volume.from, volume.to)).toBe('.mul(postgain(slider(0.8, 0, 1.5)))')
        expect(first('x: s("bd").mul(postgain("<0.5!4 1!4>"))').calls[1]).toMatchObject({ name: 'volume', args: [{ kind: 'string', value: '<0.5!4 1!4>' }] })
    })

    it('leaves every other multiplying and every other level alone', () => {
        const names = (code: string) => first(code).calls.map((call) => call.name)
        expect(names('x: note("c").mul(2)')).toEqual(['note', 'mul'])
        expect(names('x: s("bd").mul(gain(0.5))')).toEqual(['s', 'mul'])
        expect(names('x: s("bd").mul(postgain(0.5), 2)')).toEqual(['s', 'mul'])
        expect(names('x: s("hh").postgain("1 1.5 1 1")')).toEqual(['s', 'postgain'])
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

    it('reads strings, chains of calls, and marks everything else as other', () => {
        const calls = first('x: note("c").s("sawtooth").pan(sine.slow(4)).lastOf(4, y => y.rev()).add(perlin)').calls
        expect(calls[1].args[0]).toMatchObject({ kind: 'string', value: 'sawtooth' })
        const signal = calls[2].args[0]
        expect(signal.kind === 'chain' && signal.calls.map((call) => call.name)).toEqual(['slow'])
        expect(calls[3].args.map((a) => a.kind)).toEqual(['number', 'other'])
        expect(calls[4].args[0].kind).toBe('other')
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
