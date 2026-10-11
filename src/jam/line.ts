import type { FromRelay } from './protocol'

// The line to the relay of a jam. One jam, one line: it is opened to invite or to join, and
// closed when the jam is over.
export type Line = { send(message: object): void; sendBytes(bytes: Uint8Array): Promise<void>; close(): void }
export type LineEvents = { message(message: FromRelay): void; bytes(frame: ArrayBuffer): void; closed(): void }

const FULL = 1024 * 1024
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

export function openLine(url: string, on: LineEvents): Promise<Line> {
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
        socket.onopen = () => {
            open = true
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
            if (!open) return reject(new Error('unreachable'))
            if (!ours) on.closed()
        }
    })
}
