import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkSong } from '../../src/guard/check'
import { readSongFile } from '../../src/library/songfile'

const DEMOS = join(__dirname, '..', '..', 'demos')

// The demo on the site plays only music code, so a demo song with anything else in it would
// stay silent there.
describe('the demo songs', () => {
    for (const file of readdirSync(DEMOS).filter((name) => name.endsWith('.weft'))) {
        it(`${file} is all music code and brings no sounds of its own`, () => {
            const song = readSongFile(readFileSync(join(DEMOS, file), 'utf8'), file)
            expect(song).not.toBeNull()
            expect(checkSong(song!.code)).toBeNull()
            expect(song!.sounds).toEqual([])
        })
    }
})
