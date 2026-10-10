import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { STARTER } from '../../src/song/starter'

describe('analyze', () => {
    it('finds the named patterns of the starter song in order', () => {
        const song = analyze(STARTER)
        expect(song.error).toBeNull()
        expect(song.patterns.map((p) => p.id)).toEqual(['drums', 'bass', 'chords', 'lead'])
    })

    it('gives each pattern the lines it owns', () => {
        const lines = analyze(STARTER).patterns.map((p) => [p.lineFrom, p.lineTo])
        expect(lines).toEqual([[4, 7], [9, 13], [15, 17], [19, 21]])
    })

    it('reads mute from a leading underscore and keeps the label as written', () => {
        const lead = analyze(STARTER).patterns[3]
        expect(lead.muted).toBe(true)
        expect(lead.label).toBe('_lead')
        expect(analyze(STARTER).patterns[0].muted).toBe(false)
    })

    it('reads mute from a trailing underscore', () => {
        const [block] = analyze('lead_: s("bd")').patterns
        expect(block).toMatchObject({ id: 'lead', label: 'lead_', muted: true })
    })

    it('gives the character range of the label and of the statement', () => {
        const [drums] = analyze(STARTER).patterns
        expect(STARTER.slice(drums.labelFrom, drums.labelTo)).toBe('drums')
        expect(STARTER.slice(drums.from, drums.from + 6)).toBe('drums:')
        expect(STARTER.slice(drums.to - 8, drums.to)).toBe('x.rev())')
    })

    it('names the sound from bank, otherwise from a one-word s or sound', () => {
        expect(analyze(STARTER).patterns.map((p) => p.soundName)).toEqual(['RolandTR909', 'sawtooth', 'gm_epiano1', 'triangle'])
        expect(analyze('x: sound("piano")').patterns[0].soundName).toBe('piano')
        expect(analyze('x: s("bd hh")').patterns[0].soundName).toBeNull()
        expect(analyze('x: s("bd*4")').patterns[0].soundName).toBeNull()
    })

    it('numbers anonymous patterns in order', () => {
        const song = analyze('$: s("bd")\n$: s("hh")\n_$: s("cp")')
        expect(song.patterns.map((p) => p.id)).toEqual(['pattern 1', 'pattern 2', 'pattern 3'])
        expect(song.patterns.map((p) => p.muted)).toEqual([false, false, true])
    })

    it('ignores code that is not a labelled pattern', () => {
        const song = analyze('const x = 1\nsetcpm(30)\ns("bd")')
        expect(song).toEqual({ patterns: [], error: null })
    })

    it('reports a parse error with its line and no patterns', () => {
        const song = analyze('drums: s("bd"\nbass: note("c")')
        expect(song.patterns).toEqual([])
        expect(song.error).toEqual({ message: 'Unexpected token', line: 2 })
    })
})
