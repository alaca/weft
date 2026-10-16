import { describe, expect, it } from 'vitest'
import { allSnippets, cleanSnippetName, readSnippets, snippetsFor, STARTERS, withSnippet, writeSnippets } from '../../src/library/snippets'

describe('snippets', () => {
    it('are named with one word that can be typed in the code', () => {
        expect(cleanSnippetName('  Dub Echo! ')).toBe('dub-echo')
        expect(cleanSnippetName('9 hats')).toBe('hats')
        expect(cleanSnippetName('***')).toBe('')
    })

    it('are kept and read back, leaving out what is not a snippet', () => {
        const kept = withSnippet(withSnippet([], 'dub', '.room(0.5)'), 'hats', 'hats: s("hh*8")')
        expect(readSnippets(writeSnippets(kept))).toEqual([
            { name: 'hats', code: 'hats: s("hh*8")', own: true },
            { name: 'dub', code: '.room(0.5)', own: true },
        ])
        expect(readSnippets('[{"name":"x"},{"name":"ok","code":" "},{"code":"a"},7]')).toEqual([])
        expect(readSnippets('not json')).toEqual([])
    })

    it('of yours take the place of one the app comes with, and are offered by what is typed', () => {
        const own = withSnippet([], 'dub', '.room(0.9)')
        const all = allSnippets(own)
        expect(all.filter((snippet) => snippet.name === 'dub')).toEqual([{ name: 'dub', code: '.room(0.9)', own: true }])
        expect(all).toHaveLength(STARTERS.length)
        expect(snippetsFor(all, 'Of').map((snippet) => snippet.name)).toEqual(['offhats'])
        expect(snippetsFor(all, '')).toEqual([])
    })
})
