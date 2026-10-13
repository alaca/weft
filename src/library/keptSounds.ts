// The sounds the app plays are fetched from where Strudel keeps them: first the lists that say
// which sounds there are, then the file of each sound when it is first played. Every one of
// them is kept on this machine from then on. A sound that was played once plays again without a
// network, and the app starts with its sounds when there is none.
//
// A file of a sound never changes, so the copy that is kept is used and the network is not
// asked again. A list can change, so the copy that is kept is used at once, which is also why
// the sounds are ready sooner, and a new one is fetched meanwhile for the next start.
export type KeptFile = { url: string; type: string; bytes: ArrayBuffer; size: number; usedAt: number }
export type KeptInfo = Pick<KeptFile, 'url' | 'size' | 'usedAt'>
export type FileStore = {
    get(url: string): Promise<KeptFile | null>
    put(file: KeptFile): Promise<void>
    remove(url: string): Promise<void>
    // What is kept, without the files themselves.
    list(): Promise<KeptInfo[]>
}

export const SOUND_HOSTS = ['raw.githubusercontent.com', 'felixroos.github.io']
// More than this is not kept. What was used longest ago makes room for what is fetched now.
export const MOST_KEPT = 1024 * 1024 * 1024
const DAY = 24 * 60 * 60 * 1000

const isList = (url: URL) => url.pathname.endsWith('.json')

const addressOf = (input: RequestInfo | URL): string => (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
const methodOf = (input: RequestInfo | URL, init?: RequestInit): string => (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase()

export function keepFetched(original: typeof fetch, store: FileStore, options: { now?: () => number; most?: number; base?: string } = {}): typeof fetch {
    const now = options.now ?? Date.now
    const most = options.most ?? MOST_KEPT
    let known: Map<string, KeptInfo> | null = null
    const all = async () => (known ??= new Map((await store.list().catch(() => [])).map((info) => [info.url, info])))

    const answer = (file: KeptFile) => new Response(file.bytes, { status: 200, headers: { 'Content-Type': file.type } })

    async function keep(url: string, response: Response) {
        try {
            const bytes = await response.arrayBuffer()
            const file: KeptFile = { url, type: response.headers.get('Content-Type') ?? 'application/octet-stream', bytes, size: bytes.byteLength, usedAt: now() }
            await store.put(file)
            const kept = await all()
            kept.set(url, { url, size: file.size, usedAt: file.usedAt })
            let total = 0
            for (const info of kept.values()) total += info.size
            for (const old of [...kept.values()].sort((a, b) => a.usedAt - b.usedAt)) {
                if (total <= most) break
                if (old.url === url) continue
                await store.remove(old.url)
                kept.delete(old.url)
                total -= old.size
            }
        } catch {
            // What cannot be kept is still played: it was handed on before this was tried.
        }
    }

    // When a file was last used is written down once a day at most, which is close enough to
    // tell what has not been used for a long time.
    function used(file: KeptFile) {
        if (now() - file.usedAt < DAY) return
        const usedAt = now()
        known?.set(file.url, { url: file.url, size: file.size, usedAt })
        void store.put({ ...file, usedAt }).catch(() => undefined)
    }

    return async (input, init) => {
        let url: URL | null = null
        try {
            url = new URL(addressOf(input), options.base ?? (typeof location === 'undefined' ? undefined : location.href))
        } catch {
            url = null
        }
        if (!url || methodOf(input, init) !== 'GET' || !SOUND_HOSTS.includes(url.hostname)) return original(input, init)
        const key = url.href
        const kept = await store.get(key).catch(() => null)
        if (kept) {
            used(kept)
            if (isList(url))
                void original(input, init)
                    .then((fresh) => (fresh.ok ? keep(key, fresh) : undefined))
                    .catch(() => undefined)
            return answer(kept)
        }
        const response = await original(input, init)
        if (response.ok) void keep(key, response.clone())
        return response
    }
}

const DATABASE = 'weft-fetched'
const FILES = 'files'
const INDEX = 'index'

const settled = <T>(request: IDBRequest<T>) =>
    new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
const done = (transaction: IDBTransaction) =>
    new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
    })

// Where the files are kept: beside each one, in a list of its own, how big it is and when it
// was last used, so that what is kept can be looked through without reading every file.
export function fileStore(): FileStore {
    let opened: Promise<IDBDatabase> | null = null
    const open = () =>
        (opened ??= (() => {
            const request = indexedDB.open(DATABASE, 1)
            request.onupgradeneeded = () => {
                request.result.createObjectStore(FILES, { keyPath: 'url' })
                request.result.createObjectStore(INDEX, { keyPath: 'url' })
            }
            return settled(request)
        })())
    return {
        async get(url) {
            const database = await open()
            return (await settled(database.transaction(FILES, 'readonly').objectStore(FILES).get(url) as IDBRequest<KeptFile | undefined>)) ?? null
        },
        async put(file) {
            const database = await open()
            const both = database.transaction([FILES, INDEX], 'readwrite')
            both.objectStore(FILES).put(file)
            both.objectStore(INDEX).put({ url: file.url, size: file.size, usedAt: file.usedAt })
            await done(both)
        },
        async remove(url) {
            const database = await open()
            const both = database.transaction([FILES, INDEX], 'readwrite')
            both.objectStore(FILES).delete(url)
            both.objectStore(INDEX).delete(url)
            await done(both)
        },
        async list() {
            const database = await open()
            return settled(database.transaction(INDEX, 'readonly').objectStore(INDEX).getAll() as IDBRequest<KeptInfo[]>)
        },
    }
}

// From here on everything the window fetches from where the sounds are kept goes through the
// copies on this machine. Where nothing can be kept, sounds are fetched as they always were.
export function keepSoundsHere(): void {
    if (typeof indexedDB === 'undefined' || typeof window === 'undefined') return
    window.fetch = keepFetched(window.fetch.bind(window), fileStore())
}
