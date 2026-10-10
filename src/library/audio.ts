import type { Depth } from './wav'

// What can be chosen when a song is made into an audio file: the kind of file, and how good.
export type Format = 'wav' | 'mp3'
export type Quality = 'standard' | 'high' | 'highest'
export type AudioOptions = { format: Format; quality: Quality }
export type Grade = { sampleRate: number; depth?: Depth; kbps?: number; about: string }

export const FORMATS: Format[] = ['wav', 'mp3']
export const QUALITIES: Quality[] = ['standard', 'high', 'highest']
export const DEFAULT_AUDIO: AudioOptions = { format: 'wav', quality: 'standard' }
export const CHANNELS = 2
// How long the last notes and their echo may go on after the last bar.
export const RING_SECONDS = 4

export const GRADES: Record<Format, Record<Quality, Grade>> = {
    wav: {
        standard: { sampleRate: 44100, depth: 16, about: '16 bit, 44.1 kHz, as on a CD' },
        high: { sampleRate: 48000, depth: 24, about: '24 bit, 48 kHz' },
        highest: { sampleRate: 96000, depth: 32, about: '32 bit float, 96 kHz' },
    },
    mp3: {
        standard: { sampleRate: 44100, kbps: 128, about: '128 kbps, a small file' },
        high: { sampleRate: 44100, kbps: 192, about: '192 kbps' },
        highest: { sampleRate: 44100, kbps: 320, about: '320 kbps, the best an MP3 can be' },
    },
}

export const gradeOf = (options: AudioOptions): Grade => GRADES[options.format][options.quality]

// What was chosen last time, as it was kept. Anything that is not a choice on offer is dropped.
export function readAudio(text: string | null): AudioOptions {
    try {
        const kept = JSON.parse(text ?? '{}') as Partial<AudioOptions>
        return {
            format: FORMATS.includes(kept.format as Format) ? (kept.format as Format) : DEFAULT_AUDIO.format,
            quality: QUALITIES.includes(kept.quality as Quality) ? (kept.quality as Quality) : DEFAULT_AUDIO.quality,
        }
    } catch {
        return DEFAULT_AUDIO
    }
}

// The size of the file for this many seconds of sound.
export function sizeOf(options: AudioOptions, seconds: number): number {
    const grade = gradeOf(options)
    if (grade.kbps) return Math.round((seconds * grade.kbps * 1000) / 8)
    return 44 + Math.round(seconds * grade.sampleRate) * CHANNELS * ((grade.depth ?? 16) / 8)
}

export function durationText(seconds: number): string {
    const whole = Math.round(seconds)
    return whole < 60 ? `${whole} s` : `${Math.floor(whole / 60)} min ${whole % 60} s`
}

export function sizeText(bytes: number): string {
    const megabytes = bytes / 1_000_000
    return megabytes < 10 ? `${megabytes.toFixed(1)} MB` : `${Math.round(megabytes)} MB`
}
