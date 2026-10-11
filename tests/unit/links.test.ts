import { describe, expect, it } from 'vitest'
import { songOfLink } from '../../src/desktop/links'

describe('songOfLink', () => {
    it('reads the song a link of this app asks for', () => {
        expect(songOfLink('weft://song/ab12cd')).toBe('ab12cd')
        expect(songOfLink(' weft://song/ab12cd/ ')).toBe('ab12cd')
    })

    it('knows no other kind of link, and takes no address from one', () => {
        expect(songOfLink('weft://song/')).toBeNull()
        expect(songOfLink('weft://song/AB12')).toBeNull()
        expect(songOfLink('weft://song/ab12cd?from=https://example.com')).toBeNull()
        expect(songOfLink('weft://song/../../etc/passwd')).toBeNull()
        expect(songOfLink('weft://open?url=https://example.com/x.weft')).toBeNull()
        expect(songOfLink('https://example.com/songs/ab12cd')).toBeNull()
        expect(songOfLink('weft://song/abcdefghijklmnopq')).toBeNull()
    })
})
