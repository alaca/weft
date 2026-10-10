import { describe, expect, it } from 'vitest'
import { lengthText, soundNameFor } from '../../src/library/sounds'

const free = () => false

describe('soundNameFor', () => {
    it('makes a name the code can say from a file name', () => {
        expect(soundNameFor('My Vocal Take 2.wav', free)).toBe('my_vocal_take_2')
        expect(soundNameFor('kick.MP3', free)).toBe('kick')
        expect(soundNameFor('  --Hook (final).m4a', free)).toBe('hook_final')
        expect(soundNameFor('Étude.flac', free)).toBe('e_tude')
    })

    it('starts with a letter whatever the file is called', () => {
        expect(soundNameFor('808 clap.wav', free)).toBe('sound_808_clap')
        expect(soundNameFor('???.wav', free)).toBe('sound')
    })

    it('keeps a name short', () => {
        expect(soundNameFor(`${'a'.repeat(80)}.wav`, free)).toHaveLength(40)
    })

    it('takes the next free name when one is taken', () => {
        const taken = (name: string) => ['bd', 'vocal', 'vocal_2'].includes(name)
        expect(soundNameFor('bd.wav', taken)).toBe('bd_2')
        expect(soundNameFor('Vocal.wav', taken)).toBe('vocal_3')
    })
})

describe('lengthText', () => {
    it('says a short sound to a tenth of a second and a long one in minutes', () => {
        expect(lengthText(0.42)).toBe('0.4 s')
        expect(lengthText(12.4)).toBe('12 s')
        expect(lengthText(95)).toBe('1 min 35 s')
    })
})
