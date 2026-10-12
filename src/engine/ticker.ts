// A window that is out of sight has its timers slowed to one a second. The song's clock has to
// go off ten times a second, and the notes it asks for too late are never played. The timers of
// a worker are not slowed, so the clock's timer is kept in one, which says each time it goes
// off. Until the worker has said that it runs, and where there cannot be one, the window's own
// timer is used: a worker that is not let to load is made all the same, and then says nothing.
type Ticking = { tick: () => void; own?: ReturnType<typeof setInterval> }

const ticking = new Map<number, Ticking>()
let last = 0
let worker: Worker | null = null

// The worker is made as the app opens, so that it runs long before the first Play.
try {
    const made = new Worker(new URL('./ticker.worker.ts', import.meta.url), { type: 'module' })
    // A timer that was stopped may still have a tick on its way. That tick must do nothing: the
    // clock would take it for a start, and ask the song for notes after Stop.
    made.onmessage = ({ data }) => {
        if (data === 'ready') worker = made
        else ticking.get(data)?.tick()
    }
} catch {
    // There are no workers here.
}

// The two are called as setInterval and clearInterval are.
export function startTicking(tick: () => void, ms: number): number {
    const id = ++last
    if (worker) {
        ticking.set(id, { tick })
        worker.postMessage({ id, ms })
    } else {
        ticking.set(id, { tick, own: setInterval(tick, ms) })
    }
    return id
}

export function stopTicking(id: number) {
    const one = ticking.get(id)
    if (!one) return
    ticking.delete(id)
    if (one.own === undefined) worker?.postMessage({ id })
    else clearInterval(one.own)
}
