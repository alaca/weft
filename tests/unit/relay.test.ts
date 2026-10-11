import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { createRelay, type Relay } from '../../server/relay'

type Heard = { t: string; [key: string]: unknown }
type Person = { socket: WebSocket; heard: Heard[]; frames: Buffer[]; next: (t: string) => Promise<Heard>; send: (message: object) => void; closed: Promise<number> }

let relay: Relay
const people: Person[] = []

async function person(): Promise<Person> {
    const socket = new WebSocket(`ws://127.0.0.1:${relay.port}`)
    const heard: Heard[] = []
    const frames: Buffer[] = []
    const waiting: { t: string; done: (message: Heard) => void }[] = []
    socket.on('message', (data, binary) => {
        if (binary) return void frames.push(data as Buffer)
        const message = JSON.parse(data.toString()) as Heard
        const at = waiting.findIndex((entry) => entry.t === message.t)
        if (at >= 0) waiting.splice(at, 1)[0].done(message)
        else heard.push(message)
    })
    const closed = new Promise<number>((resolve) => socket.on('close', (code) => resolve(code)))
    await new Promise((resolve, reject) => {
        socket.once('open', resolve)
        socket.once('error', reject)
    })
    const made: Person = {
        socket,
        heard,
        frames,
        closed,
        send: (message) => socket.send(JSON.stringify(message)),
        next: (t) => {
            const at = heard.findIndex((message) => message.t === t)
            if (at >= 0) return Promise.resolve(heard.splice(at, 1)[0])
            return new Promise((done) => waiting.push({ t, done }))
        },
    }
    people.push(made)
    return made
}

async function pair() {
    const host = await person()
    host.send({ t: 'host', name: 'Ante' })
    const { code } = await host.next('invite')
    const guest = await person()
    guest.send({ t: 'join', code, name: 'Mara' })
    await guest.next('in')
    await host.next('joined')
    return { host, guest, code: String(code) }
}

const quiet = () => new Promise((resolve) => setTimeout(resolve, 60))

beforeEach(async () => {
    relay = await createRelay({ port: 0 })
})

afterEach(async () => {
    people.splice(0).forEach((one) => one.socket.terminate())
    await relay.close()
})

describe('the relay of a jam', () => {
    it('gives the one who invites a code of six letters and digits that are not mistaken for each other', async () => {
        const host = await person()
        host.send({ t: 'host', name: 'Ante' })
        const invite = await host.next('invite')
        expect(invite.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
        expect(relay.rooms()).toBe(1)
    })

    it('lets one person in with the code, however it was typed, and tells each who the other is', async () => {
        const host = await person()
        host.send({ t: 'host', name: '  Ante  ' })
        const { code } = await host.next('invite')
        const guest = await person()
        const typed = `${String(code).slice(0, 3).toLowerCase()}-${String(code).slice(3).toLowerCase()} `
        guest.send({ t: 'join', code: typed, name: 'Mara' })
        expect(await guest.next('in')).toEqual({ t: 'in', name: 'Ante' })
        expect(await host.next('joined')).toEqual({ t: 'joined', name: 'Mara' })
    })

    it('takes no second person on the same invite', async () => {
        const { code } = await pair()
        const third = await person()
        third.send({ t: 'join', code, name: 'Tomo' })
        expect(await third.next('no')).toEqual({ t: 'no', why: 'code' })
    })

    it('shows the door to someone who keeps trying codes', async () => {
        const guesser = await person()
        for (let tries = 0; tries < 5; tries++) guesser.send({ t: 'join', code: 'AAAAAA', name: 'x' })
        expect(await guesser.closed).toBe(1008)
    })

    it('hands what one tells on to the other, and to nobody else', async () => {
        const { host, guest } = await pair()
        const outsider = await person()
        guest.send({ t: 'tell', d: { k: 'say', text: 'hello' } })
        expect(await host.next('told')).toEqual({ t: 'told', d: { k: 'say', text: 'hello' } })
        await quiet()
        expect(guest.heard).toEqual([])
        expect(outsider.heard).toEqual([])
    })

    it('hands pieces of a sound on as they are', async () => {
        const { host, guest } = await pair()
        host.socket.send(Buffer.from([1, 2, 3, 250]), { binary: true })
        await quiet()
        expect(guest.frames.map((frame) => [...frame])).toEqual([[1, 2, 3, 250]])
        expect(host.frames).toEqual([])
    })

    it('numbers the changes, sends each to both, and drops one made without knowing those before it', async () => {
        const { host, guest } = await pair()
        host.send({ t: 'push', v: 0, updates: [{ by: 'a', changes: [1] }] })
        guest.send({ t: 'push', v: 0, updates: [{ by: 'b', changes: [2] }] })
        expect((await host.next('updates')).updates).toEqual([{ by: 'a', changes: [1] }])
        expect((await guest.next('updates')).updates).toEqual([{ by: 'a', changes: [1] }])
        await quiet()
        expect(host.heard).toEqual([])
        guest.send({ t: 'push', v: 1, updates: [{ by: 'b', changes: [2] }, { by: 'b', changes: [3] }] })
        expect((await host.next('updates')).updates).toHaveLength(2)
        await guest.next('updates')
        host.send({ t: 'push', v: 3, updates: [{ by: 'a', changes: [4] }] })
        expect((await guest.next('updates')).updates).toEqual([{ by: 'a', changes: [4] }])
    })

    it('takes no changes while the one who invited is still alone', async () => {
        const host = await person()
        host.send({ t: 'host', name: 'Ante' })
        await host.next('invite')
        host.send({ t: 'push', v: 0, updates: [{ by: 'a', changes: [1] }] })
        await quiet()
        expect(host.heard).toEqual([])
    })

    it('tells the one who stays when the other leaves, and the jam is gone', async () => {
        const { host, guest } = await pair()
        guest.send({ t: 'leave' })
        expect(await host.next('over')).toEqual({ t: 'over', why: 'left' })
        expect(relay.rooms()).toBe(0)
        expect(guest.heard).toEqual([])
    })

    it('tells the one who stays when the line of the other is cut', async () => {
        const { host, guest } = await pair()
        host.socket.terminate()
        expect(await guest.next('over')).toEqual({ t: 'over', why: 'left' })
        expect(relay.rooms()).toBe(0)
    })

    it('lets an invite that nobody took run out', async () => {
        await relay.close()
        relay = await createRelay({ port: 0, waitMs: 40 })
        const host = await person()
        host.send({ t: 'host', name: 'Ante' })
        await host.next('invite')
        expect(await host.next('over')).toEqual({ t: 'over', why: 'expired' })
        expect(relay.rooms()).toBe(0)
    })

    it('makes no more jams than it was told to hold', async () => {
        await relay.close()
        relay = await createRelay({ port: 0, maxRooms: 1 })
        const first = await person()
        first.send({ t: 'host', name: 'Ante' })
        await first.next('invite')
        const second = await person()
        second.send({ t: 'host', name: 'Mara' })
        expect(await second.next('no')).toEqual({ t: 'no', why: 'full' })
    })

    it('closes the line of someone who sends what is not a message', async () => {
        const stranger = await person()
        stranger.socket.send('not json')
        expect(await stranger.closed).toBe(1003)
    })

    it('drops a line that no longer answers', async () => {
        await relay.close()
        relay = await createRelay({ port: 0, beatMs: 30 })
        const { host, guest } = await pair()
        guest.socket.pause()
        expect(await host.next('over')).toEqual({ t: 'over', why: 'left' })
    })
})
