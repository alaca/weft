import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { applyEdit, applyEdits } from '../../src/song/edits'
import { readKit } from '../../src/song/kit'
import { noteText, readNotes } from '../../src/song/notes'
import { appendPattern, duplicateEdit, freeName, PATTERN_STARTERS, patternNameFrom, removePattern, renameEdit, starterCode, swapEdits } from '../../src/song/patterns'

const blockOf = (code: string) => {
    const song = analyze(code)
    expect(song.error).toBeNull()
    return song.patterns[0]
}

describe('starterCode', () => {
    it('starts every pattern with nothing in it', () => {
        expect(starterCode('drums', 'drums2')).toBe(
            'drums2: stack(\n' +
                '  s("bd").struct("~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n' +
                '  s("sd").struct("~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n' +
                '  s("cp").struct("~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n' +
                '  s("hh").struct("~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n' +
                ')\n  .bank("RolandTR909")',
        )
        expect(starterCode('bass', 'bass')).toBe('bass: note("~")\n  .s("sawtooth")\n  .lpf(slider(900, 100, 8000))')
        expect(starterCode('chords', 'chords')).toBe('chords: note("~")\n  .s("gm_epiano1")\n  .room(slider(0.3, 0, 1))')
        expect(starterCode('melody', 'melody')).toBe('melody: note("~")\n  .s("triangle")\n  .delay(slider(0.25, 0, 1))')
    })

    it('writes drums as a kit of four sounds with no hits, and the others for the piano roll', () => {
        const kit = readKit(blockOf(starterCode('drums', 'drums')))
        expect(kit?.rows.map((row) => row.sound)).toEqual(['bd', 'sd', 'cp', 'hh'])
        expect(kit?.rows.every((row) => row.steps.length === 16 && !row.steps.some(Boolean))).toBe(true)
        for (const kind of ['bass', 'chords', 'melody'] as const) {
            expect(noteText(blockOf(starterCode(kind, kind)))?.text).toBe('~')
            expect(readNotes(blockOf(starterCode(kind, kind)))).toBeNull()
        }
    })

    it('gives every starter a sound', () => {
        for (const starter of PATTERN_STARTERS) expect(blockOf(starterCode(starter.kind, starter.name)).soundName).not.toBeNull()
    })

    it('gives the pitched starters a range of notes to click in', () => {
        const [drums, ...pitched] = PATTERN_STARTERS
        expect(drums.range).toBeUndefined()
        for (const starter of pitched) expect(starter.range && starter.range.high - starter.range.low).toBeGreaterThanOrEqual(12)
    })
})

describe('freeName', () => {
    it('keeps the name when nothing has it', () => {
        expect(freeName('drums', ['bass'])).toBe('drums')
    })

    it('counts up from two, ignoring case', () => {
        expect(freeName('drums', ['Drums'])).toBe('drums2')
        expect(freeName('drums', ['drums', 'drums2', 'drums4'])).toBe('drums3')
    })
})

describe('appendPattern', () => {
    it('adds the pattern after a blank line at the end', () => {
        const code = 'setcpm(120/4)\n\nbass: note("c2")\n\n\n'
        expect(applyEdit(code, appendPattern(code, 'lead: note("c4")'))).toBe('setcpm(120/4)\n\nbass: note("c2")\n\nlead: note("c4")\n')
    })

    it('starts an empty song without blank lines', () => {
        expect(applyEdit('', appendPattern('', 'lead: note("c4")'))).toBe('lead: note("c4")\n')
        expect(applyEdit(' \n', appendPattern(' \n', 'lead: note("c4")'))).toBe('lead: note("c4")\n')
    })
})

describe('removePattern', () => {
    const SONG = 'setcpm(120/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n\n_bass: note("c2")\n  .s("sawtooth")\n\nlead: note("c4")\n'
    const without = (code: string, id: string) => {
        const block = analyze(code).patterns.find((p) => p.id === id)
        if (!block) throw new Error(`no pattern called ${id}`)
        return applyEdit(code, removePattern(code, block))
    }

    it('takes a pattern out with the blank line before it', () => {
        expect(without(SONG, 'bass')).toBe('setcpm(120/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n\nlead: note("c4")\n')
        expect(without(SONG, 'drums')).toBe('setcpm(120/4)\n\n_bass: note("c2")\n  .s("sawtooth")\n\nlead: note("c4")\n')
    })

    it('leaves one line break after the last thing that stays', () => {
        expect(without(SONG, 'lead')).toBe('setcpm(120/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n\n_bass: note("c2")\n  .s("sawtooth")\n')
    })

    it('takes the blank lines after a pattern that is first in the code', () => {
        expect(without('drums: s("bd*4")\n\nlead: note("c4")\n', 'drums')).toBe('lead: note("c4")\n')
        expect(without('\ndrums: s("bd*4")\n', 'drums')).toBe('')
    })

    it('takes a closing semicolon and spaces at the end of the line', () => {
        expect(without('lead: note("c4")\n\ndrums: s("bd*4");  \n\nbass: note("c2")\n', 'drums')).toBe('lead: note("c4")\n\nbass: note("c2")\n')
    })

    it('leaves comments where they are', () => {
        expect(without('// the beat\ndrums: s("bd*4")\n\nlead: note("c4")\n', 'drums')).toBe('// the beat\n\nlead: note("c4")\n')
        expect(without('lead: note("c4")\n\ndrums: s("bd*4") // four\n', 'drums')).toBe('lead: note("c4")\n\n// four\n')
    })

    it('never pulls the next pattern up into a comment', () => {
        expect(without('// two on a line\ndrums: s("bd*4"); lead: note("c4")\n', 'drums')).toBe('// two on a line\nlead: note("c4")\n')
        expect(without('drums: s("bd*4"); lead: note("c4")\n', 'lead')).toBe('drums: s("bd*4");\n')
    })

    it('can be undone by putting the same text back', () => {
        for (const id of ['drums', 'bass', 'lead']) {
            const block = analyze(SONG).patterns.find((p) => p.id === id)
            if (!block) throw new Error(`no pattern called ${id}`)
            const edit = removePattern(SONG, block)
            const after = applyEdit(SONG, edit)
            expect(applyEdit(after, { from: edit.from, to: edit.from, insert: SONG.slice(edit.from, edit.to) })).toBe(SONG)
        }
    })
})

describe('renaming, duplicating and moving a pattern', () => {
    const CODE = 'setcpm(120/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n\n// the low end\n_bass: note("c2 e2")\n  .s("sawtooth")\n\nlead_: note("c4")\n'
    const blocks = () => analyze(CODE).patterns

    it('makes a name the code can hold from what was typed', () => {
        expect(patternNameFrom('  big drums ')).toBe('big_drums')
        expect(patternNameFrom('2nd-verse!')).toBe('ndverse')
        expect(patternNameFrom('_hidden_')).toBe('hidden')
        expect(patternNameFrom('Snare')).toBe('snare')
        expect(patternNameFrom('Kick')).toBe('Kick')
        expect(patternNameFrom(' !! ')).toBeNull()
    })

    it('renames a pattern and keeps the underscore that mutes it', () => {
        expect(applyEdit(CODE, renameEdit(blocks()[0], 'beat'))).toContain('\n\nbeat: s("bd*4")\n')
        expect(applyEdit(CODE, renameEdit(blocks()[1], 'low'))).toContain('\n_low: note("c2 e2")\n')
        expect(applyEdit(CODE, renameEdit(blocks()[2], 'top'))).toContain('\ntop_: note("c4")\n')
    })

    it('puts a copy straight after the pattern, under its new name and not muted', () => {
        const next = applyEdit(CODE, duplicateEdit(CODE, blocks()[1], 'bass2'))
        expect(next).toContain('_bass: note("c2 e2")\n  .s("sawtooth")\n\nbass2: note("c2 e2")\n  .s("sawtooth")\n\nlead_: note("c4")\n')
        expect(analyze(next).patterns.map((block) => block.id)).toEqual(['drums', 'bass', 'bass2', 'lead'])
    })

    it('lets two patterns change places and leaves what is between them where it was', () => {
        const next = applyEdits(CODE, swapEdits(CODE, blocks()[0], blocks()[1]))
        expect(next).toBe('setcpm(120/4)\n\n_bass: note("c2 e2")\n  .s("sawtooth")\n\n// the low end\ndrums: s("bd*4")\n  .bank("RolandTR909")\n\nlead_: note("c4")\n')
        expect(analyze(next).patterns.map((block) => block.id)).toEqual(['bass', 'drums', 'lead'])
    })
})
