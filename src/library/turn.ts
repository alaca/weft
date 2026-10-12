// A turn given to whatever else waits for the window's thread: the screen, and the song, whose
// notes are timed on it. Long work asks for this every few thousandths of a second. It is asked
// with a message the window sends itself, which comes back as soon as the others have had their
// turn; a timer of no length is held back longer than that. The line the message went over is
// closed again, so nothing is left open behind it.
export const giveTurn = (): Promise<void> =>
    new Promise((resolve) => {
        const { port1, port2 } = new MessageChannel()
        port1.onmessage = () => {
            port1.close()
            resolve()
        }
        port2.postMessage(null)
    })

const DUE_MS = 8

// For long work that is done a step at a time. Asked after every step, it gives a turn when a
// few thousandths of a second have passed since the last one, and nothing before that: how long
// a step takes depends on the machine and on what is in it.
export function turnWhenDue(): () => Promise<void> {
    let since = performance.now()
    return async () => {
        if (performance.now() - since < DUE_MS) return
        await giveTurn()
        since = performance.now()
    }
}
