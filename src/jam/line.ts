import { PIECE, type FromRelay } from './protocol'

// The line to the relay of a jam. One jam, one line: it is opened to invite or to join, and
// closed when the jam is over.
export type Line = { send(message: object): void; sendBytes(bytes: Uint8Array): Promise<void>; close(): void }
export type LineEvents = { message(message: FromRelay): void; bytes(frame: ArrayBuffer): void; closed(): void }

// Whatever waits in the line is ahead of all that is said after it, so of a long sound no more
// than about two pieces wait there at a time.
const FULL = 2 * PIECE
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

// A line that can be opened is open within a second or two. Where something between this
// machine and the relay holds it without ever answering, as a firewall or a virus scanner can,
// nothing would say so: the line would be on its way for good, and the jam panel with it. So
// one that is not open after this long is given up, and said to be unreachable.
export const OPEN_WITHIN = 10_000

export function openLine(url: string, on: LineEvents, within = OPEN_WITHIN): Promise<Line> {
    return new Promise((resolve, reject) => {
        let socket: WebSocket
        try {
            socket = new WebSocket(url)
        } catch (err) {
            return reject(err)
        }
        socket.binaryType = 'arraybuffer'
        let open = false
        let ours = false
        const late = window.setTimeout(() => {
            reject(new Error('unreachable'))
            socket.close()
        }, within)
        socket.onopen = () => {
            open = true
            window.clearTimeout(late)
            resolve({
                send: (message) => {
                    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
                },
                // A long sound is not poured into the line faster than the line carries it.
                async sendBytes(bytes) {
                    while (socket.readyState === WebSocket.OPEN && socket.bufferedAmount > FULL) await wait(20)
                    if (socket.readyState === WebSocket.OPEN) socket.send(bytes)
                },
                close() {
                    ours = true
                    socket.close()
                },
            })
        }
        socket.onmessage = (event) => {
            if (typeof event.data !== 'string') return on.bytes(event.data as ArrayBuffer)
            try {
                on.message(JSON.parse(event.data) as FromRelay)
            } catch {
                return
            }
        }
        socket.onclose = () => {
            window.clearTimeout(late)
            if (!open) return reject(new Error('unreachable'))
            if (!ours) on.closed()
        }
    })
}
