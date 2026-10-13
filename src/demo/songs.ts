import { keeping } from '../library/kept'
import { createShelf, type SongRecord } from '../library/shelf'
import { readSongFile } from '../library/songfile'

// The songs the demo comes with. They are put where the app looks for your songs, so it opens
// into the first of them as it opens into the song that was open last.
const FILES = import.meta.glob<string>('../../demos/*.weft', { query: '?raw', import: 'default', eager: true })
const FIRST = 'Night shift'

export function fillDemo(): void {
    const shelf = createShelf(keeping)
    const now = Date.now()
    Object.entries(FILES).forEach(([path, text], index) => {
        const read = readSongFile(text, path)
        if (!read) return
        const record: SongRecord = { id: `demo${index}`, name: read.name, saved: read.code, draft: read.code, changedAt: now, ...(Object.keys(read.keys).length ? { keys: read.keys } : {}) }
        shelf.write(record)
        if (read.name === FIRST || shelf.current() === null) shelf.setCurrent(record.id)
    })
}
