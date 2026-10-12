import { beforeEach, describe, expect, it } from 'vitest'
import { cleanName, createShelf, freeTitle, infoOf, whenText, type Shelf, type SongRecord } from '../../src/library/shelf'

// A store with room for so many characters, names and values together, as the app's window has.
function memory(room = Infinity): Storage {
    const map = new Map<string, string>()
    const taken = () => [...map].reduce((sum, [key, value]) => sum + key.length + value.length, 0)
    return {
        get length() {
            return map.size
        },
        key: (index: number) => [...map.keys()][index] ?? null,
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => {
            const before = map.has(key) ? key.length + map.get(key)!.length : 0
            if (taken() - before + key.length + value.length > room) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
            map.set(key, value)
        },
        removeItem: (key: string) => void map.delete(key),
        clear: () => map.clear(),
    }
}

const song = (id: string, name: string, changedAt: number, draft = 'a', saved = draft): SongRecord => ({ id, name, saved, draft, changedAt })

describe('the shelf of songs', () => {
    let store: Storage
    let shelf: Shelf
    beforeEach(() => {
        store = memory()
        shelf = createShelf(store)
    })

    it('keeps a song and gives it back as it was', () => {
        const record = song('one', 'Night bus', 5, 'drums: s("bd*4")\n', 'drums: s("bd")\n')
        shelf.write(record)
        expect(shelf.read('one')).toEqual(record)
        expect(shelf.read('two')).toBeNull()
    })

    it('writes a song that is as it was saved once, and one that has changed twice', () => {
        const code = 'drums: s("bd*4")\n'
        const same = song('one', 'Same', 1, code)
        const changed = song('two', 'Changed', 2, `${code}// more\n`, code)
        shelf.write(same)
        shelf.write(changed)
        expect(JSON.parse(store.getItem('weft.songs.one')!)).toEqual({ name: 'Same', saved: code, changedAt: 1 })
        expect(JSON.parse(store.getItem('weft.songs.two')!)).toEqual({ name: 'Changed', saved: code, draft: `${code}// more\n`, changedAt: 2 })
        expect(shelf.read('one')).toEqual(same)
        expect(shelf.read('two')).toEqual(changed)
        expect(shelf.list().map((entry) => entry.changed)).toEqual([true, false])
    })

    it('reads the songs that were kept with both versions, changed or not', () => {
        store.setItem('weft.songs.one', JSON.stringify({ name: 'Same', saved: 'a', draft: 'a', changedAt: 1 }))
        store.setItem('weft.songs.two', JSON.stringify({ name: 'Changed', saved: 'a', draft: 'b', changedAt: 2 }))
        store.setItem('weft.songs.three', JSON.stringify({ name: 'Broken', saved: 'a', draft: 5, changedAt: 3 }))
        expect(shelf.read('one')).toEqual(song('one', 'Same', 1, 'a'))
        expect(shelf.read('two')).toEqual(song('two', 'Changed', 2, 'b', 'a'))
        expect(shelf.read('three')).toBeNull()
    })

    it('says when there is no room for a song, and what was kept before is still there', () => {
        store = memory(200)
        shelf = createShelf(store)
        const first = song('one', 'First', 1, 'x'.repeat(100))
        expect(shelf.write(first)).toBe(true)
        expect(shelf.write({ ...first, draft: 'y'.repeat(100) })).toBe(false)
        expect(shelf.write(song('two', 'Second', 2, 'z'.repeat(100)))).toBe(false)
        expect(shelf.read('one')).toEqual(first)
        expect(shelf.list().map((entry) => entry.id)).toEqual(['one'])
        store.removeItem('weft.songs.one')
        expect(shelf.write(song('two', 'Second', 2, 'z'.repeat(100)))).toBe(true)
    })

    it('goes on without remembering which song is open when there is no room for that', () => {
        shelf = createShelf(memory(0))
        expect(() => shelf.setCurrent('two')).not.toThrow()
        expect(shelf.current()).toBeNull()
    })

    it('lists the songs, the one changed last first, and says which differ from what was saved', () => {
        shelf.write(song('one', 'Old', 1))
        shelf.write(song('two', 'New', 9, 'b', 'a'))
        shelf.write(song('three', 'Middle', 5))
        expect(shelf.list()).toEqual([
            { id: 'two', name: 'New', changed: true, changedAt: 9 },
            { id: 'three', name: 'Middle', changed: false, changedAt: 5 },
            { id: 'one', name: 'Old', changed: false, changedAt: 1 },
        ])
    })

    it('removes a song and leaves the others', () => {
        shelf.write(song('one', 'A', 1))
        shelf.write(song('two', 'B', 2))
        shelf.remove('one')
        expect(shelf.list().map((entry) => entry.name)).toEqual(['B'])
    })

    it('remembers which song is open', () => {
        expect(shelf.current()).toBeNull()
        shelf.setCurrent('two')
        expect(shelf.current()).toBe('two')
    })

    it('passes over what is not a song', () => {
        shelf.write(song('one', 'A', 1))
        store.setItem('weft.songs.broken', '{not json')
        store.setItem('weft.songs.partial', '{"name":"x"}')
        store.setItem('weft.volume', '0.8')
        expect(shelf.list().map((entry) => entry.id)).toEqual(['one'])
        expect(shelf.read('broken')).toBeNull()
    })
})

describe('names', () => {
    it('gives a new song a name no other has', () => {
        expect(freeTitle('Untitled', [])).toBe('Untitled')
        expect(freeTitle('Untitled', ['untitled', 'Untitled 2'])).toBe('Untitled 3')
        expect(freeTitle('Night bus copy', ['Night bus'])).toBe('Night bus copy')
    })

    it('tidies a name that was typed', () => {
        expect(cleanName('  Night   bus \n')).toBe('Night bus')
        expect(cleanName('   ')).toBe('')
        expect(cleanName('x'.repeat(80))).toHaveLength(60)
    })

    it('says a song is changed when it differs from what was saved', () => {
        expect(infoOf(song('one', 'A', 1, 'b', 'a')).changed).toBe(true)
        expect(infoOf(song('one', 'A', 1)).changed).toBe(false)
    })
})

describe('whenText', () => {
    const minute = 60_000
    it('says how long ago in the largest unit that fits', () => {
        const now = 1_000 * 24 * 60 * minute
        expect(whenText(now - 20_000, now)).toBe('just now')
        expect(whenText(now - 5 * minute, now)).toBe('5 min ago')
        expect(whenText(now - 3 * 60 * minute, now)).toBe('3 h ago')
        expect(whenText(now - 30 * 60 * minute, now)).toBe('yesterday')
        expect(whenText(now - 4 * 24 * 60 * minute, now)).toBe('4 days ago')
        expect(whenText(now + 5 * minute, now)).toBe('just now')
    })
})
