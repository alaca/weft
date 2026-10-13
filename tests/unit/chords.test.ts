import { describe, expect, it } from 'vitest'
import { checkSong } from '../../src/guard/check'
import { analyze } from '../../src/song/analyze'
import { applyEdit, applyEdits } from '../../src/song/edits'
import { chordAt, chordsEdit, followCells, followerCode, followerEdits, readChords, readFollower, registerEdit, tonesText } from '../../src/song/chords'

const SONG = 'setcpm(120/4)\n\ndrums: s("bd*4")\n'
const put = (code: string, values: string[] | null) => {
    const edit = chordsEdit(code, analyze(code), values)
    return edit ? applyEdit(code, edit) : code
}

describe('the chords of a song', () => {
    it('are a chord for every bar, written once under a name, in front of the first pattern', () => {
        const withChords = put(SONG, ['Am', 'Am', 'F', 'F', 'C', 'G7'])
        expect(withChords).toBe('setcpm(120/4)\n\nconst chords = "<Am!2 F!2 C G7>"\n\ndrums: s("bd*4")\n')
        expect(readChords(withChords)?.values).toEqual(['Am', 'Am', 'F', 'F', 'C', 'G7'])
        expect(analyze(withChords).error).toBeNull()
        expect(analyze(withChords).patterns.map((block) => block.id)).toEqual(['drums'])
        expect(checkSong(withChords)).toBeNull()
    })

    it('are changed where they stand, and taken out again whole', () => {
        const first = put(SONG, ['C', 'C'])
        const next = put(first, ['Dm7', 'BbM7'])
        expect(next).toContain('const chords = "<Dm7 BbM7>"\n')
        expect(put(next, ['Dm7', 'BbM7'])).toBe(next)
        expect(put(next, null)).toBe(SONG)
    })

    it('go round when they are fewer than the bars, and are not read from a line that is something else', () => {
        const lane = readChords('const chords = "<Am F#m7>"')!
        expect([0, 1, 2, 3].map((bar) => chordAt(lane, bar))).toEqual(['Am', 'F#m7', 'Am', 'F#m7'])
        for (const line of ['const chords = "Am F"', 'const chords = "<Am [F C]>"', 'const chords = "<1 2>"', 'const chord = "<Am>"', 'let chords = "<Am>"']) expect(readChords(line), line).toBeNull()
    })
})

describe('a pattern that follows the chords', () => {
    const code = (kind: 'pad' | 'bass' | 'arp') => `const chords = "<Am F>"\n\n${followerCode(kind, kind, ['.pan(slider(0.5, 0, 1))'])}\n`
    const read = (text: string) => readFollower(text, analyze(text).patterns[0])!

    it('is started as the whole chord once a bar, the note it is named after on the beats, or its notes one by one', () => {
        expect(code('pad')).toContain('pad: n("[0,1,2,3] ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~").chord(chords).mode("root:c3").voicing()\n  .s("gm_epiano1")')
        expect(code('bass')).toContain('bass: n("0 ~ ~ ~   0 ~ ~ ~   0 ~ ~ ~   0 ~ ~ ~").chord(chords).mode("root:c2").voicing()')
        expect(code('arp')).toContain('arp: n("0 ~ 1 ~   2 ~ 3 ~   2 ~ 1 ~   0 ~ 1 ~").chord(chords).mode("root:c4").voicing()')
        for (const kind of ['pad', 'bass', 'arp'] as const) expect(checkSong(code(kind)), kind).toBeNull()
        // In three quarters the bass still falls on the beats.
        expect(tonesText(followCells('bass', 12, 3))).toContain('0 ~ ~')
    })

    it('is read as a grid of the notes of the chord, counted from the bottom, and written back as it stands', () => {
        const text = code('bass')
        const follower = read(text)
        expect([follower.steps, follower.cycles, follower.register]).toEqual([16, 1, 'low'])
        expect(follower.cells[0]).toEqual([0])
        const cells = follower.cells.map((cell, at) => (at === 2 ? [2, 4] : at === 4 ? [] : cell))
        expect(applyEdits(text, followerEdits(follower, cells))).toContain('n("0 ~ [2,4] ~   ~ ~ ~ ~   0 ~ ~ ~   0 ~ ~ ~")')
    })

    it('sits lower or higher by what is said after the chord', () => {
        const text = code('bass')
        const block = analyze(text).patterns[0]
        expect(applyEdits(text, [registerEdit(text, block, read(text), 'high')!])).toContain('.chord(chords).mode("root:c4").voicing()')
        expect(registerEdit(text, block, read(text), 'low')).toBeNull()
    })

    it('is left to the code when it follows something else, or is written another way', () => {
        for (const text of ['a: n("0 1").chord("<Am F>").voicing()', 'a: n("0 1").chord(chords)', 'a: n("0 9").chord(chords).voicing()', 'a: n("0*2 1").chord(chords).voicing()', 'a: note("c e").chord(chords).voicing()']) {
            expect(readFollower(text, analyze(text).patterns[0]), text).toBeNull()
        }
    })
})
