import { SONG_LIMIT, type PackedSound } from './songfile'
import { giveTurn } from './turn'

// A song file small enough to publish. A song's own sounds are what makes a file large, so each
// is made into an MP3, at the best quality at which the whole file fits. A sound that an MP3
// would not make smaller is left as it is. This is only done for publishing: a song file that
// is exported holds its sounds as they are.
export const SHRINK_STEPS = [128, 96, 64]

export type Decoded = { channels: Float32Array[]; sampleRate: number }
export type Shrunk = { sounds: PackedSound[]; fits: boolean; kbps: number | null }

// The rate a sound is handed to the encoder at: the one the encoder writes it at. What the
// encoder makes of a sound it has to bring to another rate itself is silence, so the sound is
// read again at that rate first. Under 128 kbps two channels are written at a lower rate than
// sounds come in, and nothing is written above 48000 Hz. Anything else keeps the rate it has.
const STEREO_RATES: Record<number, number> = { 96: 32000, 64: 24000 }
const MOST_RATE = 48000
const rateFor = (sound: Decoded, kbps: number): number => (sound.channels.length > 1 ? STEREO_RATES[kbps] : undefined) ?? Math.min(sound.sampleRate, MOST_RATE)

const START = 0.1

// Where a sound starts, in seconds: the first moment it is a tenth as loud as it ever gets. An
// MP3 has a little silence in front that the file it was made from did not have, and how much
// depends on what reads it. With this kept beside the sound, whoever opens the file can take
// exactly that much off again, so a drum hit still falls where it was put.
export function onsetOf(sound: Decoded): number {
    let peak = 0
    for (const channel of sound.channels) {
        for (let at = 0; at < channel.length; at++) {
            const loud = Math.abs(channel[at])
            if (loud > peak) peak = loud
        }
    }
    if (!peak) return 0
    const length = sound.channels[0]?.length ?? 0
    for (let at = 0; at < length; at++) {
        if (sound.channels.some((channel) => Math.abs(channel[at]) >= peak * START)) return at / sound.sampleRate
    }
    return 0
}

// The sound with what an MP3 put in front of it taken off, or null when there is nothing to take.
export function withoutLead(sound: Decoded, onset: number): Decoded | null {
    const lead = Math.round((onsetOf(sound) - onset) * sound.sampleRate)
    if (lead < Math.round(sound.sampleRate * 0.001)) return null
    return { channels: sound.channels.map((channel) => channel.subarray(lead)), sampleRate: sound.sampleRate }
}

const mp3Name = (file: string) => `${file.replace(/\.[a-z0-9]{1,5}$/i, '')}.mp3`

export async function shrinkSounds(
    sounds: PackedSound[],
    sizeWith: (sounds: PackedSound[]) => number,
    decode: (bytes: Uint8Array, sampleRate?: number) => Promise<Decoded | null>,
    encode: (sound: Decoded, kbps: number) => Promise<Uint8Array>,
    limit = SONG_LIMIT,
): Promise<Shrunk> {
    if (sizeWith(sounds) <= limit) return { sounds, fits: true, kbps: null }
    const heard = await Promise.all(sounds.map((sound) => decode(sound.data)))
    const onsets = heard.map((decoded) => (decoded ? onsetOf(decoded) : 0))
    let made = sounds
    for (const kbps of SHRINK_STEPS) {
        await giveTurn()
        made = []
        for (const [at, sound] of sounds.entries()) {
            const decoded = heard[at]
            const rate = decoded ? rateFor(decoded, kbps) : 0
            const fit = decoded && rate !== decoded.sampleRate ? await decode(sound.data, rate) : decoded
            const small = fit ? await encode(fit, kbps) : null
            made.push(small && small.length < sound.data.length ? { ...sound, file: mp3Name(sound.file), type: 'audio/mpeg', data: small, onset: onsets[at] } : sound)
        }
        if (sizeWith(made) <= limit) return { sounds: made, fits: true, kbps }
    }
    return { sounds: made, fits: false, kbps: SHRINK_STEPS[SHRINK_STEPS.length - 1] }
}
