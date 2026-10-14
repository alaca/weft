import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { applyEdits } from '../../src/song/edits'
import { namedBars, readSections, sectionEdits, sectionsAfter, type Section } from '../../src/song/sections'

const SONG = 'setcpm(120/4)\n\ndrums: s("bd*4")\n\nbass: note("c2")\n'
const written = (code: string, sections: Section[]) => applyEdits(code, sectionEdits(code, analyze(code).patterns, sections))

describe('the sections of a song', () => {
    it('are lines of their own, read in the order of their bars, one never over another', () => {
        const code = '// section Drop: 25-32\n// section Intro: 1-8\n// section Break: 17\n// section Over: 5-12\n// section : 3\n\ndrums: s("bd")\n'
        expect(readSections(code)).toEqual([
            { name: 'Intro', from: 0, to: 8 },
            { name: 'Over', from: 8, to: 12 },
            { name: 'Break', from: 16, to: 17 },
            { name: 'Drop', from: 24, to: 32 },
        ])
    })

    it('are written in front of the first pattern, or after the scenes, and stand together after that', () => {
        const one = written(SONG, [{ name: 'Intro', from: 0, to: 8 }])
        expect(one).toBe('setcpm(120/4)\n\n// section Intro: 1-8\n\ndrums: s("bd*4")\n\nbass: note("c2")\n')
        const scenes = '// scene Drop: drums bass\n\ndrums: s("bd")\n'
        expect(written(scenes, [{ name: 'Verse', from: 8, to: 9 }])).toBe('// scene Drop: drums bass\n// section Verse: 9\n\ndrums: s("bd")\n')
        const two = written(one, namedBars(readSections(one), 8, 16, 'Verse'))
        expect(two).toBe('setcpm(120/4)\n\n// section Intro: 1-8\n// section Verse: 9-16\n\ndrums: s("bd*4")\n\nbass: note("c2")\n')
        expect(written(two, [])).toBe(SONG)
        expect(written('// scene Drop: drums bass\n// section Verse: 9\n\ndrums: s("bd")\n', [])).toBe('// scene Drop: drums bass\n\ndrums: s("bd")\n')
    })

    it('give up the bars a new one is named over, and a name is kept short and on one line', () => {
        const sections: Section[] = [{ name: 'Verse', from: 0, to: 16 }]
        expect(namedBars(sections, 4, 8, 'Fill:\n  in')).toEqual([
            { name: 'Verse', from: 0, to: 4 },
            { name: 'Fill in', from: 4, to: 8 },
            { name: 'Verse', from: 8, to: 16 },
        ])
        expect(namedBars(sections, 0, 16, 'All')).toEqual([{ name: 'All', from: 0, to: 16 }])
        expect(namedBars(sections, 4, 8, '  ')).toBe(sections)
    })

    it('go along with the bars when bars are repeated, put in or taken out', () => {
        const sections: Section[] = [
            { name: 'Intro', from: 0, to: 2 },
            { name: 'Drop', from: 4, to: 6 },
        ]
        const again = <T,>(values: T[]) => [...values.slice(0, 6), ...values.slice(4, 6), ...values.slice(6)]
        expect(sectionsAfter(sections, 8, again)).toEqual([
            { name: 'Intro', from: 0, to: 2 },
            { name: 'Drop', from: 4, to: 8 },
        ])
        const without = <T,>(values: T[]) => [...values.slice(0, 1), ...values.slice(5)]
        expect(sectionsAfter(sections, 8, without)).toEqual([
            { name: 'Intro', from: 0, to: 1 },
            { name: 'Drop', from: 1, to: 2 },
        ])
        const spaced = <T,>(values: T[]) => [...values.slice(0, 2), ...Array.from({ length: 3 }, () => values[2]), ...values.slice(2)]
        expect(sectionsAfter(sections, 8, spaced)).toEqual([
            { name: 'Intro', from: 0, to: 2 },
            { name: 'Drop', from: 7, to: 9 },
        ])
    })
})
