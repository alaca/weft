import { describe, expect, it } from 'vitest'
import { DEFAULT_AUDIO, durationText, GRADES, gradeOf, readAudio, sizeOf, sizeText } from '../../src/library/audio'
import { encodeMp3 } from '../../src/library/mp3'

describe('readAudio', () => {
    it('gives what is usual when nothing was kept, or what was kept cannot be read', () => {
        expect(readAudio(null)).toEqual(DEFAULT_AUDIO)
        expect(readAudio('{')).toEqual(DEFAULT_AUDIO)
    })

    it('keeps the choices that are on offer and drops the rest', () => {
        expect(readAudio(JSON.stringify({ format: 'mp3', quality: 'highest' }))).toEqual({ format: 'mp3', quality: 'highest' })
        expect(readAudio(JSON.stringify({ format: 'ogg', quality: 'high' }))).toEqual({ format: 'wav', quality: 'high' })
        expect(readAudio(JSON.stringify({ format: 'mp3', quality: 9 }))).toEqual({ format: 'mp3', quality: 'standard' })
    })
})

describe('grades', () => {
    it('are a sample size and rate for WAV and a bit rate for MP3', () => {
        expect(gradeOf({ format: 'wav', quality: 'standard' })).toMatchObject({ sampleRate: 44100, depth: 16 })
        expect(gradeOf({ format: 'wav', quality: 'high' })).toMatchObject({ sampleRate: 48000, depth: 24 })
        expect(gradeOf({ format: 'wav', quality: 'highest' })).toMatchObject({ sampleRate: 96000, depth: 32 })
        expect(Object.values(GRADES.mp3).map((grade) => grade.kbps)).toEqual([128, 192, 320])
        for (const grade of Object.values(GRADES.mp3)) expect(grade.sampleRate).toBe(44100)
    })
})

describe('sizeOf', () => {
    it('counts every sample of a WAV and the bit rate of an MP3', () => {
        expect(sizeOf({ format: 'wav', quality: 'standard' }, 10)).toBe(44 + 10 * 44100 * 2 * 2)
        expect(sizeOf({ format: 'wav', quality: 'high' }, 10)).toBe(44 + 10 * 48000 * 2 * 3)
        expect(sizeOf({ format: 'mp3', quality: 'highest' }, 10)).toBe(400_000)
    })

    it('is said in minutes and megabytes', () => {
        expect(durationText(59.4)).toBe('59 s')
        expect(durationText(192)).toBe('3 min 12 s')
        expect(sizeText(3_440_000)).toBe('3.4 MB')
        expect(sizeText(33_900_000)).toBe('34 MB')
        expect(sizeText(13_400)).toBe('13 KB')
        expect(sizeText(200)).toBe('1 KB')
        expect(sizeText(100_000)).toBe('0.1 MB')
    })
})

describe('encodeMp3', () => {
    const RATE = 44100
    const tone = (seconds: number) => Float32Array.from({ length: seconds * RATE }, (_, at) => Math.sin((at / RATE) * 2 * Math.PI * 440) * 0.5)

    it('writes MP3 frames at about the bit rate that was asked for, and says how far it is', async () => {
        const steps: number[] = []
        const bytes = await encodeMp3([tone(2), tone(2)], RATE, 128, {}, (done) => steps.push(done))
        expect(bytes[0]).toBe(0xff)
        expect(bytes[1] & 0xe0).toBe(0xe0)
        expect(bytes.length).toBeGreaterThan(0.8 * 2 * 16000)
        expect(bytes.length).toBeLessThan(1.3 * 2 * 16000)
        expect(steps[steps.length - 1]).toBe(1)
    })

    it('writes only the start when told how long the song is', async () => {
        const whole = await encodeMp3([tone(2), tone(2)], RATE, 128)
        const half = await encodeMp3([tone(2), tone(2)], RATE, 128, { length: RATE })
        expect(half.length).toBeLessThan(whole.length * 0.7)
    })
})
