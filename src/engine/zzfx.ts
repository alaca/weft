// A ZZFX synth works a note out sample by sample on the window's thread, at the moment the note
// is handed over, and Strudel keeps none of it: a chord that comes round again is worked out
// again, and a long one holds the window up every time it starts. What a note of these synths
// sounds like follows from the settings below and from the rate of the audio clock, and from
// nothing else. So what was worked out is kept under them, and the next note with the same
// settings is played from there.
export const SHAPING = ['s', 'note', 'freq', 'attack', 'decay', 'sustain', 'release', 'curve', 'slide', 'deltaSlide', 'pitchJump', 'pitchJumpTime', 'lfo', 'znoise', 'zmod', 'zcrush', 'zdelay', 'tremolo', 'duration'] as const

// How many samples are kept at most: close to three minutes of sound, about 32 MB.
export const MOST_KEPT = 8_000_000

const plain = (part: unknown) => part === undefined || typeof part === 'string' || (typeof part === 'number' && Number.isFinite(part))

// What a note is kept under, or null for a note that is worked out each time: one with chance
// in its pitch (`zrand`) is another note every time, and one that brings its own list of ZZFX
// numbers (`zzfx`) is not made from the settings above. A setting that is neither a number nor
// text could not be told from another one here, so a note with one is not kept either.
export function builtKey(value: Record<string, unknown>, sampleRate: number): string | null {
    if (value.zzfx || (value.zrand !== undefined && value.zrand !== 0)) return null
    const parts = SHAPING.map((name) => value[name])
    return parts.every(plain) ? JSON.stringify([sampleRate, ...parts]) : null
}

export type Kept<T> = { find(key: string): T | undefined; keep(key: string, sound: T, length: number): void }

// What is kept, up to `most` samples in all. When there is no room for one more, what was
// played longest ago goes first, and a sound longer than all the room there is is not kept.
export function keepUpTo<T>(most: number): Kept<T> {
    // A Map hands its keys back in the order they were put in. A sound that is played is put in
    // again, so the first key is always the one played longest ago.
    const held = new Map<string, { sound: T; length: number }>()
    let total = 0
    return {
        find(key) {
            const entry = held.get(key)
            if (!entry) return undefined
            held.delete(key)
            held.set(key, entry)
            return entry.sound
        },
        keep(key, sound, length) {
            total -= held.get(key)?.length ?? 0
            held.delete(key)
            if (length > most) return
            held.set(key, { sound, length })
            total += length
            for (const [oldest, entry] of held) {
                if (total <= most) break
                held.delete(oldest)
                total -= entry.length
            }
        },
    }
}
