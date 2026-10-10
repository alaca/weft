import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { applyEdit, applyEdits, renameCalls, setString, setTempo } from '../../src/song/edits'

const first = (code: string) => analyze(code).patterns[0]

describe('setString', () => {
    it('replaces what is between the quotes', () => {
        const code = 'x: note("c").s("sawtooth")'
        const arg = first(code).calls[1].args[0]
        if (arg.kind !== 'string') throw new Error('expected a string')
        expect(applyEdit(code, setString(arg, 'square'))).toBe('x: note("c").s("square")')
    })
})

describe('renameCalls', () => {
    it('renames the calls the function has a new name for', () => {
        const code = 'x: note("c").lpf(800).lpq(4).room(0.2)'
        const names: Record<string, string> = { lpf: 'hpf', lpq: 'hpq' }
        const edits = renameCalls(first(code).calls, (name) => names[name] ?? null)
        expect(edits).toHaveLength(2)
        expect(applyEdits(code, edits)).toBe('x: note("c").hpf(800).hpq(4).room(0.2)')
    })

    it('copes with names of different lengths', () => {
        const code = 'x: note("c").cutoff(800).resonance(4)'
        const names: Record<string, string> = { cutoff: 'bpf', resonance: 'bpq' }
        expect(applyEdits(code, renameCalls(first(code).calls, (name) => names[name] ?? null))).toBe('x: note("c").bpf(800).bpq(4)')
    })
})

describe('setTempo', () => {
    it('rewrites the argument of setcpm', () => {
        const code = 'setcpm(124/4)\n\ndrums: s("bd*4")'
        expect(applyEdit(code, setTempo(analyze(code), 140))).toBe('setcpm(140/4)\n\ndrums: s("bd*4")')
    })

    it('rewrites the argument of setcps', () => {
        const code = 'setcps(0.5)'
        expect(applyEdit(code, setTempo(analyze(code), 90))).toBe('setcps(90/240)')
    })

    it('adds a tempo line before the first statement when there is none', () => {
        const code = '// a song\n\ndrums: s("bd*4")'
        expect(applyEdit(code, setTempo(analyze(code), 100))).toBe('// a song\n\nsetcpm(100/4)\n\ndrums: s("bd*4")')
    })
})
