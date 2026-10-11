import { describe, expect, it } from 'vitest'
import { checkSongFile, looksLikeAudio } from '../../src/guard/file'
import { prepareForPublishing } from '../../src/library/publish'
import type { Decoded } from '../../src/library/shrink'
import { writeSongFile, type PackedSound, type SongFile } from '../../src/library/songfile'

const wav = (bytes = 64): Uint8Array => {
    const data = new Uint8Array(bytes)
    data.set([...'RIFF'].map((letter) => letter.charCodeAt(0)), 0)
    data.set([...'WAVE'].map((letter) => letter.charCodeAt(0)), 8)
    return data
}
const mp3 = (bytes = 64): Uint8Array => {
    const data = new Uint8Array(bytes)
    data.set([0xff, 0xfb], 0)
    return data
}
const take = (name = 'take', data = wav()): PackedSound => ({ name, file: `${name}.wav`, type: 'audio/wav', seconds: 1, data })
const song = (parts: Partial<SongFile> = {}): SongFile => ({ name: 'Slow burn', code: 'setcpm(84/4)\n\nvoc: s("take")\n', keys: { voc: '9:minor' }, sounds: [take()], ...parts })
const file = (parts: Partial<SongFile> = {}) => writeSongFile(song(parts))
const changed = (change: (file: any) => void) => {
    const made = JSON.parse(file())
    change(made)
    return JSON.stringify(made)
}

describe('looksLikeAudio', () => {
    it('knows the files a sound can be by how they begin', () => {
        expect(looksLikeAudio(wav())).toBe(true)
        expect(looksLikeAudio(mp3())).toBe(true)
        for (const head of ['OggS', 'fLaC', 'ID3\u0004']) expect(looksLikeAudio(Uint8Array.from([...head.padEnd(16, 'x')].map((letter) => letter.charCodeAt(0))))).toBe(true)
        expect(looksLikeAudio(Uint8Array.from([...'\u0000\u0000\u0000 ftypM4A xxxx'].map((letter) => letter.charCodeAt(0))))).toBe(true)
    })

    it('does not take a program, a page or nothing at all for a sound', () => {
        expect(looksLikeAudio(Uint8Array.from([...'<!doctype html><script>'].map((letter) => letter.charCodeAt(0))))).toBe(false)
        expect(looksLikeAudio(Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff]))).toBe(false)
        expect(looksLikeAudio(new Uint8Array(4))).toBe(false)
        expect(looksLikeAudio(new Uint8Array(64))).toBe(false)
    })
})

describe('checkSongFile', () => {
    it('lets a song through that is music code and sounds', () => {
        expect(checkSongFile(file())).toBeNull()
        expect(checkSongFile(file({ sounds: [], code: 'setcpm(120/4)\ndrums: s("bd*4")\n', keys: {} }))).toBeNull()
        expect(checkSongFile(file({ sounds: [{ ...take('take', mp3()), file: 'take.mp3', type: 'audio/mpeg', onset: 0.05 }] }))).toBeNull()
    })

    it('refuses a song whose code is more than music, and says the line', () => {
        expect(checkSongFile(file({ code: 'setcpm(84/4)\nvoc: s("take")\nfetch("https://example.com")' }))).toEqual({ why: 'code', what: 'fetch is not something a song can use', line: 3 })
        expect(checkSongFile(file({ code: 'voc: s("take")\nwindow.x = 1' }))).toMatchObject({ why: 'code', line: 2 })
        expect(checkSongFile(file({ code: 'voc: s("take").constructor.constructor("return 1")()' }))).toMatchObject({ why: 'code', line: 1 })
        expect(checkSongFile(file({ code: 'voc: s("take"' }))).toMatchObject({ why: 'code' })
    })

    it('refuses a file over the limit', () => {
        expect(checkSongFile(file(), 100)).toMatchObject({ why: 'size' })
        expect(checkSongFile(file({ sounds: [take('take', wav(900 * 1024))] }))?.why).toBe('size')
    })

    it('refuses what is not a song file, or holds more than one has', () => {
        expect(checkSongFile('not json')?.why).toBe('file')
        expect(checkSongFile('[]')?.why).toBe('file')
        expect(checkSongFile(changed((made) => (made.weft = 2)))?.why).toBe('file')
        expect(checkSongFile(changed((made) => (made.extra = 'x')))).toEqual({ why: 'file', what: 'The file holds something a song file does not have: extra.' })
        expect(checkSongFile(changed((made) => (made.name = '')))?.why).toBe('file')
        expect(checkSongFile(changed((made) => (made.name = 'x'.repeat(61))))?.why).toBe('file')
        expect(checkSongFile(changed((made) => (made.code = 5)))?.why).toBe('file')
        expect(checkSongFile(changed((made) => (made.keys = { voc: 5 })))?.why).toBe('file')
        expect(checkSongFile(changed((made) => (made.sounds = Array(33).fill(made.sounds[0]))))?.why).toBe('file')
    })

    it('refuses a sound that is not a sound', () => {
        const page = Uint8Array.from([...'<script>alert(1)</script>'].map((letter) => letter.charCodeAt(0)))
        expect(checkSongFile(file({ sounds: [take('take', page)] }))).toEqual({ why: 'sound', what: 'The sound take is not an audio file.' })
        expect(checkSongFile(changed((made) => (made.sounds[0].data = '***')))?.why).toBe('sound')
        expect(checkSongFile(changed((made) => (made.sounds[0].name = 'Bad Name')))?.why).toBe('sound')
        expect(checkSongFile(changed((made) => (made.sounds[0].name = '__proto__')))?.why).toBe('sound')
        expect(checkSongFile(changed((made) => (made.sounds[0].type = 'text/html')))?.why).toBe('sound')
        expect(checkSongFile(changed((made) => (made.sounds[0].run = 'x')))?.why).toBe('sound')
        expect(checkSongFile(changed((made) => made.sounds.push(made.sounds[0])))?.why).toBe('sound')
    })

    it('lets a file say which published song it came from, and nothing else beside that', () => {
        expect(checkSongFile(file({ source: { id: 'ab12cd', name: 'Low sun', by: 'Mara' } }))).toBeNull()
        expect(checkSongFile(changed((made) => (made.source = { id: 'AB 12', name: 'Low sun', by: 'Mara' })))?.why).toBe('file')
        expect(checkSongFile(changed((made) => (made.source = { id: 'ab12cd', name: 'Low sun', by: 'Mara', run: 'x' })))?.why).toBe('file')
        expect(checkSongFile(changed((made) => (made.source = 'ab12cd')))?.why).toBe('file')
        expect(checkSongFile(changed((made) => (made.source = { id: 'ab12cd', name: 'x'.repeat(61), by: 'Mara' })))?.why).toBe('file')
    })

    it('refuses a sound the song does not use', () => {
        expect(checkSongFile(file({ sounds: [take(), take('hidden')] }))).toEqual({ why: 'sound', what: 'The file holds the sound hidden, which the song does not use.' })
    })
})

describe('prepareForPublishing', () => {
    const heard: Decoded = { channels: [Float32Array.from([0, 0, 1])], sampleRate: 1000 }
    const decode = async () => heard

    it('refuses code that is more than music before any sound is touched', async () => {
        let encoded = 0
        const result = await prepareForPublishing(song({ code: 'voc: s("take")\neval("1")', sounds: [take('take', wav(2000))] }), decode, async () => (encoded++, mp3()), 500)
        expect(result).toEqual({ ok: false, refused: { why: 'code', what: 'eval is not something a song can use', line: 2 } })
        expect(encoded).toBe(0)
    })

    it('leaves a song that fits as it is', async () => {
        const result = await prepareForPublishing(song(), decode, async () => mp3())
        expect(result).toMatchObject({ ok: true, kbps: null })
        expect(result.ok && JSON.parse(result.text).sounds[0].type).toBe('audio/wav')
    })

    it('makes the sounds of a song that is too large into MP3 until it fits', async () => {
        const result = await prepareForPublishing(song({ sounds: [take('take', wav(3000))] }), decode, async (_, kbps) => mp3(kbps === 64 ? 300 : 1500), 1500)
        expect(result).toMatchObject({ ok: true, kbps: 64 })
        expect(result.ok && JSON.parse(result.text).sounds[0]).toMatchObject({ file: 'take.mp3', type: 'audio/mpeg', onset: 0.002 })
    })

    it('says which sound is the largest when the song cannot be made to fit', async () => {
        const result = await prepareForPublishing(song({ code: 'a: s("take")\nb: s("other")', sounds: [take('take', wav(3000)), take('other', wav(9000))] }), decode, async (sound, kbps) => mp3(2000 + kbps), 1500)
        expect(result).toMatchObject({ ok: false, refused: { why: 'size' }, largest: { name: 'take', bytes: 2064 } })
    })
})
