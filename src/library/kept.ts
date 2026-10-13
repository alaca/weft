import { DEMO } from '../demo/demo'

// What the app keeps from one start to the next: the songs, the layout, the mix. The demo keeps
// nothing, so there all of it is held in the page and is gone with it.
function held(): Storage {
    const items = new Map<string, string>()
    return {
        get length() {
            return items.size
        },
        key: (index) => [...items.keys()][index] ?? null,
        getItem: (key) => items.get(key) ?? null,
        setItem: (key, value) => void items.set(key, String(value)),
        removeItem: (key) => void items.delete(key),
        clear: () => items.clear(),
    }
}

export const keeping: Storage = DEMO ? held() : localStorage

// Strudel's editor keeps its settings in the browser by itself. In the demo it finds this in the
// browser's place, so that nothing of the demo is left behind.
if (DEMO) Object.defineProperty(window, 'localStorage', { configurable: true, value: keeping })
