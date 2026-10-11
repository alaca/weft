import { readSource, type SongSource } from './songfile'

// The songs a person has made are kept inside the app, one record for each song. A record holds
// the song as it was last saved and the song as it is now; the second is written as you work,
// so nothing is lost when a song is not saved, and saving marks the version to go back to.
// `keys` holds the key each pattern's piano roll keeps to, by the pattern's name, written as
// "9:minor". A pattern with no key is not in it.
// `mode` is what plays, the song or every pattern, once that has been chosen for this song.
// `guarded` is true for a song that came from someone else, or that someone else has changed:
// it is only played while all of it is music code, until its owner says otherwise.
// `source` is the published song this one was downloaded as.
export type SongRecord = { id: string; name: string; saved: string; draft: string; changedAt: number; keys?: Record<string, string>; mode?: 'song' | 'live'; guarded?: boolean; source?: SongSource }
export type SongInfo = { id: string; name: string; changed: boolean; changedAt: number }

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

const PREFIX = 'weft.songs.'
const CURRENT = 'weft.current'
const NAME_LIMIT = 60

export const UNTITLED = 'Untitled'
export const NEW_SONG = 'setcpm(120/4)\n'

export const infoOf = (record: SongRecord): SongInfo => ({ id: record.id, name: record.name, changed: record.draft !== record.saved, changedAt: record.changedAt })

export function cleanName(name: string): string {
    return name.replace(/\s+/g, ' ').trim().slice(0, NAME_LIMIT)
}

export function freeTitle(base: string, taken: string[]): string {
    const used = new Set(taken.map((name) => name.toLowerCase()))
    if (!used.has(base.toLowerCase())) return base
    let count = 2
    while (used.has(`${base} ${count}`.toLowerCase())) count++
    return `${base} ${count}`
}

export function newId(): string {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function parse(id: string, text: string | null): SongRecord | null {
    if (text === null) return null
    try {
        const value = JSON.parse(text) as Partial<SongRecord>
        if (typeof value.name !== 'string' || typeof value.saved !== 'string' || typeof value.draft !== 'string') return null
        return { id, name: value.name, saved: value.saved, draft: value.draft, changedAt: typeof value.changedAt === 'number' ? value.changedAt : 0, ...(value.keys && typeof value.keys === 'object' ? { keys: value.keys } : {}), ...(value.mode === 'song' || value.mode === 'live' ? { mode: value.mode } : {}), ...(value.guarded === true ? { guarded: true } : {}), ...(readSource(value.source) ? { source: readSource(value.source)! } : {}) }
    } catch {
        return null
    }
}

export function createShelf(store: Store) {
    const read = (id: string): SongRecord | null => parse(id, store.getItem(PREFIX + id))
    const all = (): SongRecord[] => {
        const found: SongRecord[] = []
        for (let i = 0; i < store.length; i++) {
            const key = store.key(i)
            const record = key?.startsWith(PREFIX) ? read(key.slice(PREFIX.length)) : null
            if (record) found.push(record)
        }
        return found.sort((a, b) => b.changedAt - a.changedAt || a.name.localeCompare(b.name))
    }
    return {
        read,
        list: (): SongInfo[] => all().map(infoOf),
        write(record: SongRecord) {
            const { id, ...rest } = record
            store.setItem(PREFIX + id, JSON.stringify(rest))
        },
        remove: (id: string) => store.removeItem(PREFIX + id),
        current: (): string | null => store.getItem(CURRENT),
        setCurrent: (id: string) => store.setItem(CURRENT, id),
    }
}

export type Shelf = ReturnType<typeof createShelf>

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function whenText(then: number, now: number): string {
    const ago = Math.max(0, now - then)
    if (ago < MINUTE) return 'just now'
    if (ago < HOUR) return `${Math.floor(ago / MINUTE)} min ago`
    if (ago < DAY) return `${Math.floor(ago / HOUR)} h ago`
    if (ago < 2 * DAY) return 'yesterday'
    return `${Math.floor(ago / DAY)} days ago`
}
