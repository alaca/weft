import { describe, expect, it, vi } from 'vitest'
import { fitSoundName, readSongFile, renameSound, songFileLength, soundRenames, soundsUsed, writeSongFile, writeSongFileInTurns, type SongFile } from '../../src/library/songfile'

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

    it('is the same text when it is made a little at a time, and as long as it is said to be before it is made', async () => {
        const bytes = (length: number) => Uint8Array.from({ length }, (_, at) => (at * 7) % 256)
        const sounds = [100_001, 65_536, 4, 0].map((length, at) => ({ ...SONG.sounds[0], name: `take_${at}`, data: bytes(length), ...(at ? { onset: 0.01 } : {}) }))
        const song: SongFile = { ...SONG, name: 'Caf\u00e9 \u{1F3B9}', sounds, source: { id: 'ab12cd', name: 'Low sun', by: 'Mara' } }
        const text = writeSongFile(song)
        // A clock that says a long time has passed whenever it is asked, so a turn is given after every step.
        let now = 0
        const clock = vi.spyOn(performance, 'now').mockImplementation(() => (now += 100))
        try {
            expect(await writeSongFileInTurns(song)).toBe(text)
        } finally {
            clock.mockRestore()
        }
        expect(await writeSongFileInTurns(song)).toBe(text)
        expect(songFileLength(song)).toBe(text.length)
        expect(songFileLength({ ...SONG, sounds: [] })).toBe(writeSongFile({ ...SONG, sounds: [] }).length)
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

    it('are looked for in the text of the code only, never among its words or in what is commented out', () => {
        const code = 'note: note("c2").s("note stack")\n// s("gone")\nlead: stack(s(`gone2`), s(\'take\')) /* s("gone") */\n'
        expect(soundsUsed(code, ['note', 'stack', 's', 'lead', 'gone', 'gone2', 'take'])).toEqual(['note', 'stack', 'gone2', 'take'])
        expect(renameSound(code, 'note', 'note_2')).toBe('note: note("c2").s("note_2 stack")\n// s("gone")\nlead: stack(s(`gone2`), s(\'take\')) /* s("gone") */\n')
        expect(soundRenames(code, 'stack', 'x')).toEqual([{ from: 25, to: 30, insert: 'x' }])
        expect(soundsUsed('s("a.b")', ['a.b', '.*', '(', 'a+'])).toEqual(['a.b'])
    })

    it('are told apart inside and outside text all along the code, and code made up of tens of thousands of texts is answered at once', () => {
        const code = 'take: s("take").bank(take) // "take"\nlead: s(\'x take\', `take`) /* \'take\' */ + take("mistake take_2 take")'
        expect(renameSound(code, 'take', 'loop')).toBe('take: s("loop").bank(take) // "take"\nlead: s(\'x loop\', `loop`) /* \'take\' */ + take("mistake take_2 loop")')
        const long = `/* ${'take '.repeat(40000)}*/\n${'s("take");\n'.repeat(40000)}take`
        const from = performance.now()
        expect(soundRenames(long, 'take', 'loop')).toHaveLength(40000)
        expect(soundsUsed(long, ['take', 'gone'])).toEqual(['take'])
        expect(performance.now() - from).toBeLessThan(2000)
    })

    it('go by a name that cannot be taken for a note or for a letter that patterns are written with', () => {
        expect(['kick_2', 'take', 'bass', 'note', 'stack'].map(fitSoundName)).toEqual([true, true, true, true, true])
        expect(['s', 'c3', 'eb', 'x', 'bd', 'Take', 'a b', '2nd', ''].map(fitSoundName)).toEqual(Array(9).fill(false))
    })
})
