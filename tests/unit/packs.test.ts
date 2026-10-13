import { describe, expect, it } from 'vitest'
import { fitPreset, isOfPack, packIdFor, packOf, packSoundName, readPackFile, readPacks, writePackFile, writePacks, type PackFile, type PackInfo } from '../../src/library/packs'

// The start of a WAV file, which is as much as the app looks at to see that a file is sound.
const wav = () => new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([36, 0, 0, 0], [...'WAVEfmt '].map((c) => c.charCodeAt(0)), [16, 0, 0, 0]))
const pack = (): PackFile => ({
    id: 'dust',
    name: 'Dust loops',
    by: 'Ante',
    about: 'Six breaks and a bass.',
    sounds: [
        { name: 'dust_break_1', file: 'break 1.wav', type: 'audio/wav', seconds: 2, data: wav() },
        { name: 'dust_kick', file: 'kick.wav', type: 'audio/wav', seconds: 0.4, data: wav() },
    ],
    presets: [{ name: 'Dust bass', calls: ['.s("sawtooth")', '.lpf(slider(500, 100, 8000))'], pitch: 36 }],
})

describe('a pack', () => {
    it('has a short name of its own, made from the name people read', () => {
        expect(packIdFor('Dust Loops!', () => false)).toBe('dustloops')
        expect(packIdFor('808 kit', () => false)).toBe('pack808kit')
        expect(packIdFor('Dust', (id) => id === 'dust')).toBe('dust2')
        expect(packSoundName('dust', 'break_1')).toBe('dust_break_1')
        expect(isOfPack('dust', 'dust_break_1')).toBe(true)
        expect(isOfPack('dust', 'dusty_break')).toBe(false)
    })

    it('is written as one file and read back as it was', async () => {
        const read = readPackFile(await writePackFile(pack()))
        expect('pack' in read && read.left).toBe(0)
        expect('pack' in read && read.pack).toEqual(pack())
    })

    it('leaves out what does not belong in one, and says how much', async () => {
        const made = JSON.parse(await writePackFile(pack()))
        made.sounds.push({ ...made.sounds[0], name: 'other_break' }, { ...made.sounds[0], name: 'dust_text', data: btoa('just some words here') }, { ...made.sounds[0] })
        made.presets.push({ name: 'Not music', calls: ['.lpf(fetch("https://example.com"))'] }, { name: 'No dot', calls: ['s("sawtooth")'] })
        const read = readPackFile(JSON.stringify(made))
        expect('pack' in read && read.pack.sounds.map((sound) => sound.name)).toEqual(['dust_break_1', 'dust_kick'])
        expect('pack' in read && read.pack.presets.map((preset) => preset.name)).toEqual(['Dust bass'])
        expect('pack' in read && read.left).toBe(5)
    })

    it('says why when the file is no pack', async () => {
        for (const text of ['not json', '{"weft":1,"code":""}', JSON.stringify({ weftpack: 1, id: 'Dust Loops', name: 'x', sounds: [] }), JSON.stringify({ weftpack: 1, id: 'dust', name: 'Dust', sounds: [], presets: [] })]) {
            expect('why' in readPackFile(text), text).toBe(true)
        }
    })

    it('takes a preset only when it is music code', () => {
        expect(fitPreset({ name: 'Bass', calls: ['.s("sawtooth")', '.lpf(400)'] })).toBe(true)
        expect(fitPreset({ name: 'Bad', calls: ['.s("sawtooth")', '.lpf(eval("1"))'] })).toBe(false)
        expect(fitPreset({ name: 'Bad', calls: ['.s("x")); fetch("https://example.com"); note("c"'] })).toBe(false)
    })

    it('is kept between starts as what it holds, without the sounds themselves', () => {
        const info: PackInfo = { id: 'dust', name: 'Dust loops', by: 'Ante', about: '', sounds: ['dust_break_1', 'dust_kick'], presets: pack().presets, addedAt: 5 }
        expect(readPacks(writePacks([info]))).toEqual([info])
        expect(readPacks('{')).toEqual([])
        expect(packOf([info], 'dust_kick')?.name).toBe('Dust loops')
        expect(packOf([info], 'dust_snare')).toBeUndefined()
    })
})
