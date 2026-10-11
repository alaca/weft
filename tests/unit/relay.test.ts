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

type Listed = { id: string; name: string; bpm: number | null; patterns: number; since: number }
const listed = async (): Promise<Listed[]> => ((await (await fetch(`http://127.0.0.1:${relay.port}/jams`)).json()) as { jams: Listed[] }).jams

async function open(name = 'Ante', about: object = { bpm: 124, patterns: 6 }) {
    const host = await person()
    host.send({ t: 'host', name, open: true, about })
    const invite = await host.next('invite')
    return { host, id: String(invite.id), code: String(invite.code) }
}

async function asks(id: string, name = 'Tomo') {
    const asker = await person()
    asker.send({ t: 'ask', id, name })
    return asker
}

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

    it('stays up whatever is written into a message, and closes at most the line it came on', async () => {
        const odd = { toString: 1, valueOf: 1 }
        const messages = [
            { t: 'host', name: odd },
            { t: 'host', name: 'Ante', open: true, about: { bpm: odd, patterns: odd } },
            { t: 'join', code: odd, name: odd },
            { t: 'ask', id: odd, name: odd },
            { t: odd },
            { t: 'push', v: odd, updates: odd },
            { t: 'tell', d: odd },
            { t: 'let', ask: odd },
            { t: 'open', open: odd, about: 'x' },
        ]
        for (const message of messages) {
            const stranger = await person()
            stranger.send(message)
            stranger.send({ t: 'let', ask: odd })
            stranger.send({ t: 'about', about: odd })
        }
        await quiet()
        const { host, guest } = await pair()
        guest.send({ t: 'tell', d: { k: 'say', text: 'still here' } })
        expect(await host.next('told')).toEqual({ t: 'told', d: { k: 'say', text: 'still here' } })
        expect(JSON.stringify(await listed())).not.toContain('[object')
    })

    it('lets one sender hold only so many jams and lines at a time', async () => {
        await relay.close()
        relay = await createRelay({ port: 0, maxRoomsEach: 2, maxLinesEach: 4 })
        for (let count = 0; count < 2; count++) {
            const host = await person()
            host.send({ t: 'host', name: `Host ${count}` })
            await host.next('invite')
        }
        const third = await person()
        third.send({ t: 'host', name: 'One too many' })
        expect(await third.next('no')).toEqual({ t: 'no', why: 'full' })
        await person()
        const fifth = await person()
        expect(await fifth.closed).toBe(1008)
        expect(relay.rooms()).toBe(2)
    })

    it('drops a line that no longer answers', async () => {
        await relay.close()
        relay = await createRelay({ port: 0, beatMs: 30 })
        const { host, guest } = await pair()
        guest.socket.pause()
        expect(await host.next('over')).toEqual({ t: 'over', why: 'left' })
    })
})

describe('jams that are open to anyone', () => {
    it('lists a jam only when the one who made it said so, and says of it no more than a name and the size of the song', async () => {
        const quietOne = await person()
        quietOne.send({ t: 'host', name: 'Mara', about: { bpm: 90, patterns: 3 } })
        await quietOne.next('invite')
        expect(await listed()).toEqual([])
        const { id, code } = await open('  Ante  ', { bpm: 124.4, patterns: 6, code: 's("bd")' })
        const jams = await listed()
        expect(jams).toEqual([{ id, name: 'Ante', bpm: 124, patterns: 6, since: expect.any(Number) }])
        expect(JSON.stringify(jams)).not.toContain(code)
    })

    it('answers nothing else over the web, and the list to anyone', async () => {
        const list = await fetch(`http://127.0.0.1:${relay.port}/jams`)
        expect(list.headers.get('access-control-allow-origin')).toBe('*')
        expect(list.headers.get('cache-control')).toBe('no-store')
        expect((await fetch(`http://127.0.0.1:${relay.port}/`)).status).toBe(404)
        expect((await fetch(`http://127.0.0.1:${relay.port}/jams`, { method: 'POST' })).status).toBe(404)
    })

    it('lists and unlists a waiting jam as its maker says, and keeps what it says of the song as it is told', async () => {
        const host = await person()
        host.send({ t: 'host', name: 'Ante' })
        await host.next('invite')
        host.send({ t: 'about', about: { bpm: 80, patterns: 2 } })
        host.send({ t: 'open', open: true, about: { bpm: 100, patterns: 4 } })
        await quiet()
        expect(await listed()).toMatchObject([{ name: 'Ante', bpm: 100, patterns: 4 }])
        host.send({ t: 'about', about: { bpm: 'fast', patterns: -1 } })
        await quiet()
        expect(await listed()).toMatchObject([{ bpm: null, patterns: 0 }])
        host.send({ t: 'open', open: false })
        await quiet()
        expect(await listed()).toEqual([])
    })

    it('tells the one who made a jam who asks to join, and lets them in when told to', async () => {
        const { host, id } = await open()
        const asker = await asks(id, ' Tomo ')
        const asked = await host.next('asked')
        expect(asked).toEqual({ t: 'asked', ask: expect.any(String), name: 'Tomo' })
        await quiet()
        expect(asker.heard).toEqual([])
        host.send({ t: 'let', ask: asked.ask })
        expect(await asker.next('in')).toEqual({ t: 'in', name: 'Ante' })
        expect(await host.next('joined')).toEqual({ t: 'joined', name: 'Tomo' })
        expect(await listed()).toEqual([])
        asker.send({ t: 'tell', d: { k: 'say', text: 'hello' } })
        expect(await host.next('told')).toEqual({ t: 'told', d: { k: 'say', text: 'hello' } })
    })

    it('turns away the others who asked once one is let in', async () => {
        const { host, id } = await open()
        const first = await asks(id, 'Tomo')
        const one = await host.next('asked')
        const second = await asks(id, 'Deniz')
        await host.next('asked')
        host.send({ t: 'let', ask: one.ask })
        await first.next('in')
        expect(await second.next('no')).toEqual({ t: 'no', why: 'gone' })
    })

    it('says no to the one who asked when the answer is not now, and they may ask again', async () => {
        const { host, id } = await open()
        const asker = await asks(id)
        const asked = await host.next('asked')
        host.send({ t: 'deny', ask: asked.ask })
        expect(await asker.next('no')).toEqual({ t: 'no', why: 'declined' })
        expect(await listed()).toHaveLength(1)
        asker.send({ t: 'ask', id, name: 'Tomo' })
        expect((await host.next('asked')).name).toBe('Tomo')
    })

    it('does not bring the one who made a jam a second question from someone they blocked', async () => {
        const { host, id } = await open()
        const asker = await asks(id)
        const asked = await host.next('asked')
        host.send({ t: 'block', ask: asked.ask })
        expect(await asker.next('no')).toEqual({ t: 'no', why: 'declined' })
        asker.send({ t: 'ask', id, name: 'Somebody else' })
        expect(await asker.next('no')).toEqual({ t: 'no', why: 'declined' })
        await quiet()
        expect(host.heard).toEqual([])
    })

    it('tells a blocked sender from the others by the address the web server in front noted', async () => {
        await relay.close()
        relay = await createRelay({ port: 0, behindProxy: true })
        const from = async (address: string) => {
            const socket = new WebSocket(`ws://127.0.0.1:${relay.port}`, { headers: { 'X-Real-IP': address } })
            const heard: Heard[] = []
            socket.on('message', (data) => heard.push(JSON.parse(data.toString()) as Heard))
            await new Promise((resolve, reject) => {
                socket.once('open', resolve)
                socket.once('error', reject)
            })
            people.push({ socket } as Person)
            return { socket, heard }
        }
        const { host, id } = await open()
        const pest = await from('203.0.113.7')
        pest.socket.send(JSON.stringify({ t: 'ask', id, name: 'Pest' }))
        host.send({ t: 'block', ask: (await host.next('asked')).ask })
        await quiet()
        const again = await from('203.0.113.7')
        again.socket.send(JSON.stringify({ t: 'ask', id, name: 'Somebody else' }))
        const other = await from('203.0.113.8')
        other.socket.send(JSON.stringify({ t: 'ask', id, name: 'Tomo' }))
        expect((await host.next('asked')).name).toBe('Tomo')
        await quiet()
        expect(again.heard).toEqual([{ t: 'no', why: 'declined' }])
        expect(host.heard).toEqual([])
    })

    it('takes the question back when the one who asked says so or goes away', async () => {
        const { host, id } = await open()
        const first = await asks(id, 'Tomo')
        const one = await host.next('asked')
        first.send({ t: 'unask' })
        expect(await host.next('unasked')).toEqual({ t: 'unasked', ask: one.ask })
        const second = await asks(id, 'Deniz')
        const two = await host.next('asked')
        second.socket.terminate()
        expect(await host.next('unasked')).toEqual({ t: 'unasked', ask: two.ask })
        host.send({ t: 'let', ask: two.ask })
        await quiet()
        expect(host.heard).toEqual([])
    })

    it('takes back a question that nobody answered, and says so to both', async () => {
        await relay.close()
        relay = await createRelay({ port: 0, askMs: 40 })
        const { host, id } = await open()
        const asker = await asks(id)
        const asked = await host.next('asked')
        expect(await asker.next('no')).toEqual({ t: 'no', why: 'quiet' })
        expect(await host.next('unasked')).toEqual({ t: 'unasked', ask: asked.ask })
        asker.send({ t: 'ask', id, name: 'Tomo' })
        const again = await host.next('asked')
        host.send({ t: 'let', ask: again.ask })
        await asker.next('in')
        await quiet()
        expect(asker.heard).toEqual([])
    })

    it('tells those who asked when the jam is gone, taken off the list or already full', async () => {
        const { host, id, code } = await open()
        const first = await asks(id, 'Tomo')
        await host.next('asked')
        host.send({ t: 'open', open: false })
        expect(await first.next('no')).toEqual({ t: 'no', why: 'gone' })
        host.send({ t: 'open', open: true })
        const second = await asks(id, 'Deniz')
        await host.next('asked')
        const guest = await person()
        guest.send({ t: 'join', code, name: 'Mara' })
        await guest.next('in')
        expect(await second.next('no')).toEqual({ t: 'no', why: 'gone' })
        const late = await asks(id, 'Rafa')
        expect(await late.next('no')).toEqual({ t: 'no', why: 'gone' })
        const nowhere = await asks('000000000000', 'Rafa')
        expect(await nowhere.next('no')).toEqual({ t: 'no', why: 'gone' })
    })

    it('lets someone who waits in a jam of their own ask, and ends that jam when they are let in', async () => {
        const mara = await open('Mara')
        const ante = await open('Ante')
        ante.host.send({ t: 'ask', id: mara.id, name: 'Ante' })
        const asked = await mara.host.next('asked')
        expect((await listed()).map((jam) => jam.name).sort()).toEqual(['Ante', 'Mara'])
        const waiting = await asks(ante.id, 'Tomo')
        await ante.host.next('asked')
        mara.host.send({ t: 'let', ask: asked.ask })
        expect(await ante.host.next('in')).toEqual({ t: 'in', name: 'Mara' })
        expect(await waiting.next('no')).toEqual({ t: 'no', why: 'gone' })
        expect(await listed()).toEqual([])
        expect(relay.rooms()).toBe(1)
        await quiet()
        expect(ante.host.heard).toEqual([])
    })

    it('takes back the question of someone whose own jam got its second person first', async () => {
        const mara = await open('Mara')
        const ante = await open('Ante')
        ante.host.send({ t: 'ask', id: mara.id, name: 'Ante' })
        const asked = await mara.host.next('asked')
        const guest = await person()
        guest.send({ t: 'join', code: ante.code, name: 'Tomo' })
        await ante.host.next('joined')
        expect(await mara.host.next('unasked')).toEqual({ t: 'unasked', ask: asked.ask })
        expect(relay.rooms()).toBe(2)
    })

    it('does not let anyone ask their own jam, ask twice at once, or answer for a jam that is not theirs', async () => {
        const { host, id } = await open()
        host.send({ t: 'ask', id, name: 'Ante' })
        expect(await host.next('no')).toEqual({ t: 'no', why: 'gone' })
        const other = await open('Mara')
        const asker = await asks(id)
        const asked = await host.next('asked')
        asker.send({ t: 'ask', id: other.id, name: 'Tomo' })
        other.host.send({ t: 'let', ask: asked.ask })
        await quiet()
        expect(other.host.heard).toEqual([])
        expect(asker.heard).toEqual([])
    })

    it('hears no more than a handful of questions for one jam at a time, and shows the door to someone who keeps asking', async () => {
        const { host, id } = await open()
        for (let count = 0; count < 5; count++) {
            await asks(id, `P${count}`)
            await host.next('asked')
        }
        const sixth = await asks(id, 'Late')
        expect(await sixth.next('no')).toEqual({ t: 'no', why: 'busy' })
        const pest = await person()
        for (let count = 0; count < 21; count++) pest.send({ t: 'ask', id: 'nothing', name: 'x' })
        expect(await pest.closed).toBe(1008)
    })
})
