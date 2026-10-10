import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { applyEdit } from '../../src/song/edits'
import { readGrid, sourceText } from '../../src/song/grid'
import { noteText, readNotes } from '../../src/song/notes'
import { appendPattern, freeName, PATTERN_STARTERS, removePattern, starterCode } from '../../src/song/patterns'

const blockOf = (code: string) => {
    const song = analyze(code)
    expect(song.error).toBeNull()
    return song.patterns[0]
}

describe('starterCode', () => {
    it('writes drums as a grid the drum grid can read back', () => {
        const code = starterCode('drums', 'drums')
        expect(code).toBe(
            'drums: s(`\n' +
                '  bd ~  ~  ~    bd ~  ~  ~    bd ~  ~  ~    bd ~  ~  ~ ,\n' +
                '  ~  ~  ~  ~    cp ~  ~  ~    ~  ~  ~  ~    cp ~  ~  ~ ,\n' +
                '  ~  ~  hh ~    ~  ~  hh ~    ~  ~  hh ~    ~  ~  hh ~\n' +
                '`)\n  .bank("RolandTR909")',
        )
        const grid = readGrid(blockOf(code))?.grid
        expect(grid?.rows.map((row) => row.sound)).toEqual(['bd', 'cp', 'hh'])
        expect(grid?.steps).toBe(16)
    })

    it('writes a bass line and a melody as one voice of sixteen steps', () => {
        for (const kind of ['bass', 'melody'] as const) {
            const grid = readNotes(blockOf(starterCode(kind, kind)))?.grid
            expect(grid?.steps).toBe(16)
            expect(grid?.cycles).toBe(1)
            expect(grid?.notes.length).toBeGreaterThan(4)
        }
        expect(starterCode('bass', 'bass')).toContain('  d2 _  ~  d2   ~  ~  f2 ~    d2 _  ~  ~    a1 _  c2 _\n')
    })

    it('writes chords as three voices over four cycles', () => {
        const code = starterCode('chords', 'chords')
        expect(code).toContain('`).slow(4)\n  .s("gm_epiano1")')
        const grid = readNotes(blockOf(code))?.grid
        expect(grid?.cycles).toBe(4)
        expect(grid?.perCycle).toBe(4)
        expect(grid?.notes).toHaveLength(12)
    })

    it('writes empty patterns as the silence the grid and the roll leave behind', () => {
        expect(starterCode('emptyDrums', 'drums2')).toBe('drums2: s("~")\n  .bank("RolandTR909")')
        expect(starterCode('emptyNotes', 'notes')).toBe('notes: note("~")\n  .s("triangle")')
        expect(sourceText(blockOf(starterCode('emptyDrums', 'drums')))?.text).toBe('~')
        expect(noteText(blockOf(starterCode('emptyNotes', 'notes')))?.text).toBe('~')
    })

    it('gives every starter a sound', () => {
        for (const starter of PATTERN_STARTERS) expect(blockOf(starterCode(starter.kind, starter.name)).soundName).not.toBeNull()
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
