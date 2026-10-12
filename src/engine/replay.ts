// The song is made to sound as its code now reads in a turn of its own, after the screen has
// followed the change: two short stretches of work are not heard where one long one is.
// Everything that asks for it in the same turn is answered by doing it once.
//
// A change that is one of a run, such as a note under a dragged pointer or a key that is held
// down, asks to be held. The song then follows when the run has rested for a moment, and
// during a long run about once a second, so that what is changed is still heard meanwhile.
const REST = 250
const AT_MOST = 1000

export function createReplay(run: () => void) {
    let timer: ReturnType<typeof setTimeout> | undefined
    let due = 0
    // When the run began whose changes are being held. Null while nothing is held.
    let heldSince: number | null = null

    const dropReplay = () => {
        clearTimeout(timer)
        timer = undefined
        heldSince = null
    }
    const at = (when: number) => {
        clearTimeout(timer)
        due = when
        timer = setTimeout(() => {
            dropReplay()
            run()
        }, Math.max(0, when - performance.now()))
    }
    const replay = (held = false) => {
        const now = performance.now()
        if (!held) {
            heldSince = null
            return at(now)
        }
        // One that is already due is not put off by a change that can wait.
        if (timer !== undefined && now >= due) return
        heldSince ??= now
        at(Math.min(now + REST, heldSince + AT_MOST))
    }
    // The run is over, as when the pointer is let go: what was held is done now.
    const replayHeld = () => {
        if (heldSince !== null) replay()
    }
    return { replay, replayHeld, dropReplay }
}
