import { DEMO } from '../demo/demo'

// Audio files of your own, kept inside the app so that a song which uses one still finds it
// the next time the app is opened. Each is known by a name made from its file name, and that
// name is what the code says: s("my_vocal").
// `pack` is the pack a sound came in, when it is not one of your own: it is kept in the same
// place and plays the same way, and is listed with its pack.
export type OwnSound = { name: string; file: string; seconds: number; addedAt: number; type: string; data: ArrayBuffer; pack?: string }
export type OwnSoundInfo = Pick<OwnSound, 'name' | 'file' | 'seconds' | 'pack'>

const NAME_LIMIT = 40

// A name the code can say: small letters, digits and underscores, starting with a letter, and
// not one that is taken. Strudel reads a dash as a rest and a colon as a number, so neither
// can be part of a name.
export function soundNameFor(file: string, taken: (name: string) => boolean): string {
    const base = file
        .replace(/\.[a-z0-9]{1,5}$/i, '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, NAME_LIMIT)
    const named = /^[a-z]/.test(base) ? base : base ? `sound_${base}` : 'sound'
    if (!taken(named)) return named
    let count = 2
    while (taken(`${named}_${count}`)) count++
    return `${named}_${count}`
}

export function lengthText(seconds: number): string {
    if (seconds < 10) return `${seconds.toFixed(1)} s`
    const whole = Math.round(seconds)
    return whole < 60 ? `${whole} s` : `${Math.floor(whole / 60)} min ${whole % 60} s`
}

const DATABASE = 'weft'
const STORE = 'sounds'

const settled = <T>(request: IDBRequest<T>) =>
    new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })

function open(): Promise<IDBDatabase> {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'name' })
    return settled(request)
}

async function within<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const database = await open()
    try {
        return await settled(work(database.transaction(STORE, mode).objectStore(STORE)))
    } finally {
        database.close()
    }
}

const inBrowser = {
    all: () => within<OwnSound[]>('readonly', (store) => store.getAll()),
    names: () => within<IDBValidKey[]>('readonly', (store) => store.getAllKeys()).then((keys) => keys as string[]),
    get: (name: string) => within<OwnSound | undefined>('readonly', (store) => store.get(name)).then((sound) => sound ?? null),
    put: (sound: OwnSound) => within('readwrite', (store) => store.put(sound)).then(() => undefined),
    remove: (name: string) => within('readwrite', (store) => store.delete(name)).then(() => undefined),
}

// The demo has no sounds of your own and keeps nothing, so there the place they are kept in is
// never opened.
const nowhere: typeof inBrowser = {
    all: async () => [],
    names: async () => [],
    get: async () => null,
    put: async () => undefined,
    remove: async () => undefined,
}

export const ownSoundStore = DEMO ? nowhere : inBrowser
