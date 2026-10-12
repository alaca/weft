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
