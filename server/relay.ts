import { WebSocketServer, type RawData, type WebSocket } from 'ws'

// The meeting point of a jam. Two people who jam do not reach each other directly: each holds
// one line to this relay, and it hands on what one sends to the other. It knows who is in which
// jam and how many changes the song has had since the jam began, and nothing of what is in a
// song: code, chat and sounds pass through and are not kept.
export type RelayOptions = { port: number; host?: string; maxRooms?: number; waitMs?: number; beatMs?: number }
export type Relay = { port: number; rooms: () => number; close: () => Promise<void> }

const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6
const NAME_LIMIT = 24
const FRAME_LIMIT = 512 * 1024
const WRONG_CODES = 5
const MOST_ROOMS = 500
const WAIT = 30 * 60 * 1000
const BEAT = 30 * 1000
const MOST_A_SECOND = 400

type Room = { code: string; host: WebSocket; hostName: string; guest: WebSocket | null; version: number; expires: ReturnType<typeof setTimeout> }
type Seat = { room: Room | null; wrong: number; alive: boolean; sent: number }

const nameOf = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_LIMIT) || 'Someone'
const codeOf = (value: unknown): string => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export function createRelay(options: RelayOptions): Promise<Relay> {
    const rooms = new Map<string, Room>()
    const seats = new Map<WebSocket, Seat>()
    const most = options.maxRooms ?? MOST_ROOMS
    const server = new WebSocketServer({ port: options.port, host: options.host ?? '127.0.0.1', maxPayload: FRAME_LIMIT })

    const say = (to: WebSocket | null | undefined, message: object | string) => {
        if (to && to.readyState === to.OPEN) to.send(typeof message === 'string' ? message : JSON.stringify(message))
    }
    const other = (room: Room, me: WebSocket) => (room.host === me ? room.guest : room.host)

    const freeCode = (): string => {
        for (;;) {
            let code = ''
            for (let at = 0; at < CODE_LENGTH; at++) code += LETTERS[Math.floor(Math.random() * LETTERS.length)]
            if (!rooms.has(code)) return code
        }
    }

    // A jam is over for both as soon as it is over for one: the one who stays is told, and
    // neither is in it any longer.
    const end = (room: Room, by: WebSocket | null, why: 'left' | 'expired') => {
        clearTimeout(room.expires)
        rooms.delete(room.code)
        for (const socket of [room.host, room.guest]) {
            if (!socket) continue
            const seat = seats.get(socket)
            if (seat) seat.room = null
            if (socket !== by) say(socket, { t: 'over', why })
        }
    }

    const onText = (socket: WebSocket, seat: Seat, text: string) => {
        let message: { t?: unknown; [key: string]: unknown }
        try {
            message = JSON.parse(text)
        } catch {
            return socket.close(1003)
        }
        if (!message || typeof message !== 'object') return socket.close(1003)
        const room = seat.room

        if (message.t === 'host') {
            if (room) return
            if (rooms.size >= most) return say(socket, { t: 'no', why: 'full' })
            const made: Room = { code: freeCode(), host: socket, hostName: nameOf(message.name), guest: null, version: 0, expires: setTimeout(() => end(made, null, 'expired'), options.waitMs ?? WAIT) }
            rooms.set(made.code, made)
            seat.room = made
            return say(socket, { t: 'invite', code: made.code })
        }

        // An invite is for one person and works once: a jam that has its second person takes no
        // other, and somebody who keeps trying codes is shown the door.
        if (message.t === 'join') {
            if (room) return
            const wanted = rooms.get(codeOf(message.code))
            if (!wanted || wanted.guest) {
                say(socket, { t: 'no', why: 'code' })
                if (++seat.wrong >= WRONG_CODES) socket.close(1008)
                return
            }
            clearTimeout(wanted.expires)
            wanted.guest = socket
            seat.room = wanted
            say(socket, { t: 'in', name: wanted.hostName })
            return say(wanted.host, { t: 'joined', name: nameOf(message.name) })
        }

        if (!room) return

        // Changes to the code are numbered. One that was made without knowing the changes before
        // it is dropped here: whoever made it is sent those changes, fits their own to them and
        // sends it again. That is all it takes for two people to end up with the same code.
        if (message.t === 'push') {
            const updates = message.updates
            if (!room.guest || message.v !== room.version || !Array.isArray(updates) || !updates.length) return
            room.version += updates.length
            const out = JSON.stringify({ t: 'updates', updates })
            say(room.host, out)
            return say(room.guest, out)
        }

        if (message.t === 'tell') return say(other(room, socket), { t: 'told', d: message.d })
        if (message.t === 'leave') return end(room, socket, 'left')
    }

    server.on('connection', (socket) => {
        const seat: Seat = { room: null, wrong: 0, alive: true, sent: 0 }
        seats.set(socket, seat)
        socket.on('pong', () => (seat.alive = true))
        socket.on('message', (data: RawData, binary: boolean) => {
            if (++seat.sent > MOST_A_SECOND) return socket.close(1008)
            if (!binary) return onText(socket, seat, data.toString())
            // Sounds travel as they are, in pieces, and are only handed on.
            const to = seat.room ? other(seat.room, socket) : null
            if (to && to.readyState === to.OPEN) to.send(data, { binary: true })
        })
        socket.on('close', () => {
            if (seat.room) end(seat.room, socket, 'left')
            seats.delete(socket)
        })
        socket.on('error', () => socket.terminate())
    })

    const counting = setInterval(() => seats.forEach((seat) => (seat.sent = 0)), 1000)
    const beating = setInterval(() => {
        for (const [socket, seat] of seats) {
            if (!seat.alive) {
                socket.terminate()
                continue
            }
            seat.alive = false
            socket.ping()
        }
    }, options.beatMs ?? BEAT)

    return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.once('listening', () => {
            const address = server.address()
            resolve({
                port: typeof address === 'object' && address ? address.port : options.port,
                rooms: () => rooms.size,
                close: () =>
                    new Promise<void>((done) => {
                        clearInterval(counting)
                        clearInterval(beating)
                        rooms.forEach((room) => clearTimeout(room.expires))
                        seats.forEach((_, socket) => socket.terminate())
                        server.close(() => done())
                    }),
            })
        })
    })
}
