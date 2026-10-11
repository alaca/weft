// The desk between the song and your speakers: how loud, how far to one side, more or less of
// the low, middle and high of the sound, and whether peaks are held back. It is how the song
// sounds on this machine and no part of the song.
export type Mix = { volume: number; pan: number; low: number; mid: number; high: number; limit: boolean }

export const DEFAULT_MIX: Mix = { volume: 1, pan: 0, low: 0, mid: 0, high: 0, limit: false }
export const VOLUME_MOST = 1.5
export const TONE_MOST = 12

const within = (value: unknown, least: number, most: number, usual: number, step: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.min(most, Math.max(least, value)) / step) * step : usual
const tidy = (value: number): number => Math.round(value * 100) / 100 || 0

export const fitMix = (given: Partial<Mix> | null | undefined): Mix => ({
    volume: tidy(within(given?.volume, 0, VOLUME_MOST, DEFAULT_MIX.volume, 0.01)),
    pan: tidy(within(given?.pan, -1, 1, DEFAULT_MIX.pan, 0.01)),
    low: tidy(within(given?.low, -TONE_MOST, TONE_MOST, DEFAULT_MIX.low, 0.5)),
    mid: tidy(within(given?.mid, -TONE_MOST, TONE_MOST, DEFAULT_MIX.mid, 0.5)),
    high: tidy(within(given?.high, -TONE_MOST, TONE_MOST, DEFAULT_MIX.high, 0.5)),
    limit: typeof given?.limit === 'boolean' ? given.limit : DEFAULT_MIX.limit,
})

// What was kept from last time. Anything that cannot be a setting is replaced by the usual.
export function readMix(text: string | null): Mix {
    try {
        return fitMix(JSON.parse(text ?? '{}') as Partial<Mix>)
    } catch {
        return DEFAULT_MIX
    }
}

export const isUsualMix = (mix: Mix): boolean => (Object.keys(DEFAULT_MIX) as (keyof Mix)[]).every((key) => mix[key] === DEFAULT_MIX[key])

export const volumeText = (volume: number): string => `${Math.round(volume * 100)}%`
export const panText = (pan: number): string => (Math.round(pan * 100) ? `${Math.abs(Math.round(pan * 100))}% ${pan < 0 ? 'left' : 'right'}` : 'Centre')
export const toneText = (decibel: number): string => `${decibel > 0 ? '+' : ''}${decibel} dB`

// A meter shows loudness the way ears take it, in decibels: from far below what is heard at the
// foot to a little above the loudest a machine can play without distorting at the top.
export const METER_LEAST = -48
export const METER_MOST = 6
export const METER_MARKS = [6, 0, -6, -12, -24, -48]

export const decibels = (level: number): number => (level > 0 ? 20 * Math.log10(level) : -Infinity)
export const shareOf = (decibel: number): number => Math.min(1, Math.max(0, (decibel - METER_LEAST) / (METER_MOST - METER_LEAST)))
export const meterShare = (level: number): number => shareOf(decibels(level))

// A meter rises at once and falls back slowly, so that a short hit can be read.
const FALL = 0.9
export const settle = (shown: number, heard: number, seconds: number): number => Math.max(heard, shown - FALL * Math.max(0, seconds))
