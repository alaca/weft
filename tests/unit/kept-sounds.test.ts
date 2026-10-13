import { describe, expect, it } from 'vitest'
import { keepFetched, type FileStore, type KeptFile } from '../../src/library/keptSounds'

const FILE = 'https://raw.githubusercontent.com/ritchse/tidal-drum-machines/main/machines/RolandTR909/bd/Bassdrum-01.wav'
const LIST = 'https://raw.githubusercontent.com/felixroos/dough-samples/main/tidal-drum-machines.json'

function memory(): FileStore & { files: Map<string, KeptFile> } {
    const files = new Map<string, KeptFile>()
    return {
        files,
        get: async (url) => files.get(url) ?? null,
        put: async (file) => void files.set(file.url, file),
        remove: async (url) => void files.delete(url),
        list: async () => [...files.values()].map(({ url, size, usedAt }) => ({ url, size, usedAt })),
    }
}

// A network that answers each address with its own text, counts how often it was asked, and
// can be switched off.
function network(texts: Record<string, string> = {}) {
    const asked: string[] = []
    const state = { up: true }
    const fetching = (async (input: RequestInfo | URL) => {
        const url = String(input)
        asked.push(url)
        if (!state.up) throw new TypeError('Load failed')
        const text = texts[url]
        return text === undefined ? new Response('no', { status: 404 }) : new Response(text, { status: 200, headers: { 'Content-Type': url.endsWith('.json') ? 'application/json' : 'audio/wav' } })
    }) as typeof fetch
    return { asked, state, fetching }
}

const settle = () => new Promise((done) => setTimeout(done, 5))

describe('the sounds that were fetched', () => {
    it('are kept, and played from this machine from then on, also without a network', async () => {
        const net = network({ [FILE]: 'the kick' })
        const store = memory()
        const fetched = keepFetched(net.fetching, store)
        expect(await (await fetched(FILE)).text()).toBe('the kick')
        await settle()
        expect(store.files.get(FILE)?.type).toBe('audio/wav')
        net.state.up = false
        const again = await fetched(FILE)
        expect(again.ok).toBe(true)
        expect(await again.text()).toBe('the kick')
        expect(net.asked).toEqual([FILE])
    })

    it('a sound that never was fetched fails without a network as it always did, and is not kept when the answer is an error', async () => {
        const net = network()
        const store = memory()
        const fetched = keepFetched(net.fetching, store)
        expect((await fetched(FILE)).status).toBe(404)
        await settle()
        expect(store.files.size).toBe(0)
        net.state.up = false
        await expect(fetched(FILE)).rejects.toThrow('Load failed')
    })

    it('a list is answered from the copy at once, and a new one is fetched meanwhile for the next start', async () => {
        const texts = { [LIST]: '{"v":1}' }
        const net = network(texts)
        const store = memory()
        const fetched = keepFetched(net.fetching, store)
        expect(await (await fetched(LIST)).json()).toEqual({ v: 1 })
        await settle()
        texts[LIST] = '{"v":2}'
        expect(await (await fetched(LIST)).json()).toEqual({ v: 1 })
        await settle()
        expect(net.asked).toEqual([LIST, LIST])
        expect(await (await fetched(LIST)).json()).toEqual({ v: 2 })
        // Without a network the copy still answers, and stays as it is.
        net.state.up = false
        expect(await (await fetched(LIST)).json()).toEqual({ v: 2 })
        await settle()
        expect(new TextDecoder().decode(store.files.get(LIST)!.bytes)).toBe('{"v":2}')
    })

    it('nothing else that is fetched is touched', async () => {
        const site = 'https://weftloom.dev/api/songs'
        const net = network({ [site]: '[]', [FILE]: 'the kick' })
        const store = memory()
        const fetched = keepFetched(net.fetching, store)
        await fetched(site)
        await fetched(FILE, { method: 'POST' })
        await fetched('blob:tauri://localhost/1234')
        await settle()
        expect(store.files.size).toBe(0)
        expect(net.asked).toHaveLength(3)
    })

    it('what was used longest ago makes room when more is kept than there is room for', async () => {
        const urls = ['a', 'b', 'c'].map((name) => `https://felixroos.github.io/webaudiofontdata/sound/${name}.js`)
        const net = network(Object.fromEntries(urls.map((url) => [url, 'x'.repeat(40)])))
        const store = memory()
        let clock = 1000
        const fetched = keepFetched(net.fetching, store, { now: () => clock, most: 100 })
        for (const url of urls) {
            clock += 1000
            await fetched(url)
            await settle()
        }
        expect([...store.files.keys()]).toEqual(urls.slice(1))
        // A file that is used again a day later is the newest, and is not the one to go.
        clock += 25 * 60 * 60 * 1000
        await fetched(urls[1])
        await settle()
        clock += 1000
        await fetched(urls[0])
        await settle()
        expect([...store.files.keys()].sort()).toEqual([urls[0], urls[1]])
    })
})
