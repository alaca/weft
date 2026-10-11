import { describe, expect, it } from 'vitest'
import { readSongFile, renameSound, soundsUsed, writeSongFile, type SongFile } from '../../src/library/songfile'

const SONG: SongFile = {
    name: 'Late one',
    code: 'setcpm(120/4)\n\nvox: note("c2")\n  .s("my_take")\n',
    keys: { vox: '9:minor' },
    sounds: [{ name: 'my_take', file: 'My take.wav', type: 'audio/wav', seconds: 1.5, data: Uint8Array.from([0, 1, 2, 250, 255, 128]) }],
}

describe('a song file', () => {
    it('gives the song back as it was, with its sounds byte for byte', () => {
        const back = readSongFile(writeSongFile(SONG), 'Late one.weft')
        expect(back).toEqual(SONG)
    })

    it('holds a long sound', () => {
        const data = Uint8Array.from({ length: 100_000 }, (_, at) => (at * 7) % 256)
        const back = readSongFile(writeSongFile({ ...SONG, sounds: [{ ...SONG.sounds[0], data }] }), 'x.weft')
        expect(back?.sounds[0].data).toEqual(data)
    })

    it('takes any other file as code, named after the file', () => {
        expect(readSongFile('setcpm(90/4)\n', 'Night bus.js')).toEqual({ name: 'Night bus', code: 'setcpm(90/4)\n', keys: {}, sounds: [] })
        expect(readSongFile('s("bd")', 'beat')).toMatchObject({ name: 'beat', code: 's("bd")' })
    })

    it('is not read when it is a song file with something else in it', () => {
        expect(readSongFile('not a song', 'x.weft')).toBeNull()
        expect(readSongFile('{"name":"x"}', 'x.weft')).toBeNull()
    })

    it('leaves out a sound that has no data and names a song after its file when it has no name', () => {
        const back = readSongFile(JSON.stringify({ weft: 1, code: 's("bd")', sounds: [{ name: 'a' }, { name: 'b', data: 'AAEC' }] }), 'Loop.weft')
        expect(back?.name).toBe('Loop')
        expect(back?.sounds.map((sound) => sound.name)).toEqual(['b'])
    })
})

describe('the sounds a song names', () => {
    it('are the ones that stand as whole words in its code', () => {
        expect(soundsUsed('x: note("c2").s("take")\ny: s("take_2").struct("x")', ['take', 'take_2', 'takes', 'other'])).toEqual(['take', 'take_2'])
    })

    it('can be given another name everywhere', () => {
        expect(renameSound('s("take").struct("x"), s("take_2"), s("mistake")', 'take', 'take_3')).toBe('s("take_3").struct("x"), s("take_2"), s("mistake")')
    })
})
