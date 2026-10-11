import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { WebSocketServer, type RawData, type WebSocket } from 'ws'

// The meeting point of a jam. Two people who jam do not reach each other directly: each holds
// one line to this relay, and it hands on what one sends to the other. It knows who is in which
// jam and how many changes the song has had since the jam began, and nothing of what is in a
// song: code, chat and sounds pass through and are not kept.
//
// Someone waiting for a second person can say that their jam is open. Open jams are listed for
// anyone to read, with the name the person gave, how fast the song is and how many patterns it
// has. Nobody is listed who did not ask to be, and nobody needs an account. Someone who reads
// the list can ask to join; the one who is asked lets them in or not.
export type RelayOptions = { port: number; host?: string; maxRooms?: number; waitMs?: number; beatMs?: number; askMs?: number }
export type Relay = { port: number; rooms: () => number; close: () => Promise<void> }

const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6
const NAME_LIMIT = 24
const FRAME_LIMIT = 512 * 1024
const WRONG_CODES = 5
const MOST_ROOMS = 500
const WAIT = 30 * 60 * 1000
const BEAT = 30 * 1000
const ASK_WAIT = 2 * 60 * 1000
const MOST_A_SECOND = 400
const MOST_ASKING = 5
const MOST_ASKS = 20
const MOST_LISTED = 100

type About = { bpm: number | null; patterns: number }
type Room = {
    code: string
    id: string
    host: WebSocket
    hostName: string
    guest: WebSocket | null
    version: number
    expires: ReturnType<typeof setTimeout>
    open: boolean
    about: About
    since: number
    asks: Map<string, WebSocket>
    blocked: Set<string>
}
type Seat = { room: Room | null; asking: { room: Room; ask: string; name: string; expires: ReturnType<typeof setTimeout> } | null; asked: number; wrong: number; alive: boolean; sent: number; from: string }

const aboutOf = (value: unknown): About => {
    const given = (value ?? {}) as { bpm?: unknown; patterns?: unknown }
    const bpm = Number(given.bpm)
    const patterns = Number(given.patterns)
    return { bpm: Number.isFinite(bpm) && bpm >= 1 && bpm <= 999 ? Math.round(bpm) : null, patterns: Number.isInteger(patterns) && patterns >= 0 && patterns <= 999 ? patterns : 0 }
}

const nameOf = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_LIMIT) || 'Someone'
const codeOf = (value: unknown): string => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export function createRelay(options: RelayOptions): Promise<Relay> {
    const rooms = new Map<string, Room>()
    const seats = new Map<WebSocket, Seat>()
    const most = options.maxRooms ?? MOST_ROOMS
    // The list of open jams is read as a plain page of data, by anyone, without a line.
    const web = createServer((request, response) => {
        if (request.method !== 'GET' || request.url !== '/jams') {
            response.writeHead(404, { 'Content-Type': 'application/json' })
            return response.end('{}')
        }
        const jams = [...rooms.values()]
            .filter((room) => room.open && !room.guest)
            .sort((a, b) => b.since - a.since)
            .slice(0, MOST_LISTED)
            .map((room) => ({ id: room.id, name: room.hostName, bpm: room.about.bpm, patterns: room.about.patterns, since: room.since }))
        response.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
        response.end(JSON.stringify({ jams }))
    })
    const server = new WebSocketServer({ server: web, maxPayload: FRAME_LIMIT })

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

    // Everyone who asked to join a jam and has no answer yet is told that it is no longer to be had.
    const turnAway = (room: Room, but: WebSocket | null = null) => {
        for (const socket of room.asks.values()) {
            const seat = seats.get(socket)
            clearTimeout(seat?.asking?.expires)
            if (seat) seat.asking = null
            if (socket !== but) say(socket, { t: 'no', why: 'gone' })
        }
        room.asks.clear()
    }

    // Someone who asked and no longer does: the one they asked is told, so the question goes away.
    const unask = (seat: Seat) => {
        const asking = seat.asking
        if (!asking) return
        clearTimeout(asking.expires)
        seat.asking = null
        asking.room.asks.delete(asking.ask)
        say(asking.room.host, { t: 'unasked', ask: asking.ask })
    }

    // The second person takes their place. Whatever else either of the two had going is over
    // with that: a jam of their own they were waiting in, and a question they had put to another.
    const seatIn = (room: Room, socket: WebSocket, seat: Seat, name: string) => {
        clearTimeout(room.expires)
        if (seat.asking?.room !== room) unask(seat)
        if (seat.room) end(seat.room, socket, 'left')
        const hosting = seats.get(room.host)
        if (hosting) unask(hosting)
        room.guest = socket
        seat.room = room
        turnAway(room, socket)
        say(socket, { t: 'in', name: room.hostName })
        say(room.host, { t: 'joined', name })
    }

    // A jam is over for both as soon as it is over for one: the one who stays is told, and
    // neither is in it any longer.
    const end = (room: Room, by: WebSocket | null, why: 'left' | 'expired') => {
        clearTimeout(room.expires)
        turnAway(room)
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
            const made: Room = {
                code: freeCode(),
                id: randomBytes(6).toString('hex'),
                host: socket,
                hostName: nameOf(message.name),
                guest: null,
                version: 0,
                expires: setTimeout(() => end(made, null, 'expired'), options.waitMs ?? WAIT),
                open: message.open === true,
                about: aboutOf(message.open === true ? message.about : null),
                since: Date.now(),
                asks: new Map(),
                blocked: new Set(),
            }
            rooms.set(made.code, made)
            seat.room = made
            return say(socket, { t: 'invite', code: made.code, id: made.id })
        }

        // Asking to join a jam that is listed. The one who made it is told who asks, and
        // nothing more happens until they answer.
        // Someone who waits in a jam of their own may ask as well, and stays listed meanwhile.
        if (message.t === 'ask') {
            if (seat.asking || (room && (room.host !== socket || room.guest))) return
            if (++seat.asked > MOST_ASKS) return socket.close(1008)
            const wanted = [...rooms.values()].find((one) => one.id === String(message.id ?? '') && one.open && !one.guest && one.host !== socket)
            if (!wanted) return say(socket, { t: 'no', why: 'gone' })
            if (wanted.blocked.has(seat.from)) return say(socket, { t: 'no', why: 'declined' })
            if (wanted.asks.size >= MOST_ASKING) return say(socket, { t: 'no', why: 'busy' })
            const ask = randomBytes(6).toString('hex')
            const name = nameOf(message.name)
            wanted.asks.set(ask, socket)
            // A question nobody answers does not stay open: the one who was asked may be away.
            const expires = setTimeout(() => {
                unask(seat)
                say(socket, { t: 'no', why: 'quiet' })
            }, options.askMs ?? ASK_WAIT)
            seat.asking = { room: wanted, ask, name, expires }
            return say(wanted.host, { t: 'asked', ask, name })
        }
        if (message.t === 'unask') return unask(seat)

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
            return seatIn(wanted, socket, seat, nameOf(message.name))
        }

        if (!room) return

        // What the one who made a jam says about it while they wait: whether it is listed, what
        // the list says of the song, and the answer to someone who asked.
        if (room.host === socket && !room.guest) {
            if (message.t === 'open') {
                room.open = message.open === true
                room.about = aboutOf(room.open ? message.about : null)
                if (!room.open) turnAway(room)
                return
            }
            if (message.t === 'about') return void (room.about = aboutOf(room.open ? message.about : null))
            if (message.t === 'let' || message.t === 'deny' || message.t === 'block') {
                const asker = room.asks.get(String(message.ask ?? ''))
                const theirs = asker ? seats.get(asker) : undefined
                if (!asker || !theirs?.asking) return
                if (message.t === 'let') return seatIn(room, asker, theirs, theirs.asking.name)
                // Someone who is blocked is not told so, and cannot ask this jam again from
                // where they are, under whatever name.
                if (message.t === 'block') room.blocked.add(theirs.from)
                clearTimeout(theirs.asking.expires)
                room.asks.delete(theirs.asking.ask)
                theirs.asking = null
                return say(asker, { t: 'no', why: 'declined' })
            }
        }

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

    server.on('connection', (socket, request) => {
        const seat: Seat = { room: null, asking: null, asked: 0, wrong: 0, alive: true, sent: 0, from: request.socket.remoteAddress ?? '' }
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
            unask(seat)
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
        web.once('error', reject)
        web.listen(options.port, options.host ?? '127.0.0.1', () => {
            const address = web.address()
            resolve({
                port: typeof address === 'object' && address ? address.port : options.port,
                rooms: () => rooms.size,
                close: () =>
                    new Promise<void>((done) => {
                        clearInterval(counting)
                        clearInterval(beating)
                        rooms.forEach((room) => clearTimeout(room.expires))
                        seats.forEach((seat) => clearTimeout(seat.asking?.expires))
                        seats.forEach((_, socket) => socket.terminate())
                        server.close()
                        web.closeAllConnections()
                        web.close(() => done())
                    }),
            })
        })
    })
}
