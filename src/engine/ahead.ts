// Strudel fetches the file of a sample when the first note that plays it is handed over, a
// tenth of a second before that note sounds, and drops the note when the file has not come by
// then: after each start of the app the first hit of a drum can be silent. Long before a song
// is played the window asks its patterns what they play, to draw them. Each answer is looked
// through here, and the file of every sample note in it is fetched then, so that it is there
// when the note falls due.
type Sound = { data?: { type?: string; samples?: unknown } }
export type Sounds = Record<string, Sound | undefined>

type Given = {
    sounds: () => Sounds
    // The file a note of a sample plays, as Strudel works it out from the files of its sound.
    fileOf: (value: Record<string, unknown>, files: unknown) => unknown
    // Starts fetching a file, or answers null when this is not the moment for it.
    load: (url: string) => Promise<unknown> | null
}

export type Ahead = {
    // What a pattern answered when it was asked what it plays.
    note(haps: { value: unknown }[]): void
    // Other sounds are known than before.
    again(): void
}

// On a slow line many files at once hold up the ones that are due first, so a few are fetched
// at a time, in the order they were asked for.
export const AT_ONCE = 4
// A note whose pitch slides or is left to chance is another note every time it is asked about,
// so what is remembered of notes has an end.
export const MOST = 512
// No more notes than this wait for one sound that is not known yet.
export const MOST_WAITING = 64

const isSample = (sound: Sound) => sound.data?.type === 'sample'

export function loadAhead({ sounds, fileOf, load }: Given): Ahead {
    // The notes of each sound that have been seen to. A sound that is made known again, as one
    // of your own is when it is cut shorter, is another sound here and is seen to again.
    const seen = new WeakMap<object, Set<string>>()
    // Notes of a sound that is not known yet: the lists of sounds come a moment after the app
    // has started and a sound of your own later still, and by then nobody asks again. Each
    // sound waits by itself, so that one whose pitch is another at every note cannot push out
    // the notes of the others.
    const waiting = new Map<string, Map<string, Record<string, unknown>>>()
    const asked = new Set<string>()
    const queue: string[] = []
    let loading = 0

    const next = () => {
        while (loading < AT_ONCE && queue.length) {
            const fetched = load(queue[0])
            if (!fetched) return
            queue.shift()
            loading++
            const done = () => {
                loading--
                next()
            }
            fetched.then(done, done)
        }
    }

    // The file of a note of a sample is put in line, unless that note was seen to before.
    const fetchFor = (sound: Sound, key: string, value: Record<string, unknown>) => {
        let notes = seen.get(sound)
        if (!notes) seen.set(sound, (notes = new Set()))
        if (notes.has(key)) return
        if (notes.size >= MOST) notes.clear()
        notes.add(key)
        let url: unknown
        try {
            url = fileOf(value, sound.data?.samples)
        } catch {
            return
        }
        if (typeof url !== 'string' || asked.has(url)) return
        asked.add(url)
        queue.push(url)
    }

    return {
        note(haps) {
            const known = sounds()
            for (const hap of haps) {
                const value = hap.value as Record<string, unknown> | null
                if (!value || typeof value !== 'object' || typeof value.s !== 'string') continue
                // Strudel knows a sound of a drum kit as the kit and the sound in one name, and
                // every sound in small letters.
                const name = (value.bank ? `${value.bank}_${value.s}` : value.s).toLowerCase()
                const sound = known[name]
                if (sound && !isSample(sound)) continue
                // Which file of a sound a note plays follows from its number and its pitch.
                const key = `${value.n}|${value.note}|${value.freq}`
                if (sound) {
                    fetchFor(sound, key, value)
                    continue
                }
                let notes = waiting.get(name)
                if (!notes) {
                    if (waiting.size >= MOST) waiting.delete(waiting.keys().next().value as string)
                    waiting.set(name, (notes = new Map()))
                }
                if (notes.has(key)) continue
                if (notes.size >= MOST_WAITING) notes.delete(notes.keys().next().value as string)
                notes.set(key, value)
            }
            next()
        },
        again() {
            const known = sounds()
            for (const [name, notes] of waiting) {
                const sound = known[name]
                if (!sound) continue
                waiting.delete(name)
                if (isSample(sound)) for (const [key, value] of notes) fetchFor(sound, key, value)
            }
            next()
        },
    }
}
