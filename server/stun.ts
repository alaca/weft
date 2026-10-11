import { createSocket, type RemoteInfo } from 'node:dgram'

// Two people on different networks can only send each other voice and picture once each knows
// the address the other is reached at from outside, and a machine behind a router does not
// know its own. This answers that one question, the way every such helper does (STUN, RFC
// 5389): whoever asks is told the address the question came from. It passes nothing on between
// people, so it cannot be used to send anything through this server, and it keeps nothing.
export type StunOptions = { port: number; host?: string; mostASecond?: number }
export type Stun = { port: number; close: () => Promise<void> }

const BINDING_REQUEST = 0x0001
const BINDING_ANSWER = 0x0101
const COOKIE = 0x2112a442
const XOR_MAPPED_ADDRESS = 0x0020
// How many questions one sender is answered in a second. A call asks a handful.
const MOST_A_SECOND = 20

// The answer to a question, or null when what arrived is not such a question.
export function answerTo(asked: Uint8Array, from: { address: string; port: number; family: string }): Buffer | null {
    const question = Buffer.from(asked)
    if (question.length < 20 || question.length > 1280 || question.readUInt16BE(0) !== BINDING_REQUEST || question.readUInt32BE(4) !== COOKIE || question.readUInt16BE(2) !== question.length - 20) return null
    const id = question.subarray(8, 20)
    const six = from.family === 'IPv6'
    const address = six ? sixBytes(from.address) : Buffer.from(from.address.split('.').map(Number))
    if (!address || address.length !== (six ? 16 : 4) || address.some((byte) => !(byte >= 0 && byte <= 255))) return null
    // The address is written mixed with the cookie, and a long one with the question's own
    // number as well, so that a router on the way does not rewrite it as it does plain ones.
    const mix = Buffer.concat([question.subarray(4, 8), id])
    const mixed = Buffer.from(address.map((byte, at) => byte ^ mix[at]))
    const value = Buffer.alloc(4 + mixed.length)
    value.writeUInt8(six ? 0x02 : 0x01, 1)
    value.writeUInt16BE(from.port ^ (COOKIE >>> 16), 2)
    mixed.copy(value, 4)
    const answer = Buffer.alloc(20 + 4 + value.length)
    answer.writeUInt16BE(BINDING_ANSWER, 0)
    answer.writeUInt16BE(4 + value.length, 2)
    answer.writeUInt32BE(COOKIE, 4)
    id.copy(answer, 8)
    answer.writeUInt16BE(XOR_MAPPED_ADDRESS, 20)
    answer.writeUInt16BE(value.length, 22)
    value.copy(answer, 24)
    return answer
}

function sixBytes(text: string): Buffer | null {
    const [head, tail = ''] = text.split('%')[0].split('::')
    const parts = (side: string) => (side ? side.split(':') : [])
    const groups = text.includes('::') ? [...parts(head), ...Array(8 - parts(head).length - parts(tail).length).fill('0'), ...parts(tail)] : parts(head)
    if (groups.length !== 8) return null
    const bytes = Buffer.alloc(16)
    groups.forEach((group, at) => bytes.writeUInt16BE(parseInt(group, 16) || 0, at * 2))
    return bytes
}

export function createStun(options: StunOptions): Promise<Stun> {
    const socket = createSocket({ type: 'udp4' })
    const asked = new Map<string, number>()
    const most = options.mostASecond ?? MOST_A_SECOND
    const counting = setInterval(() => asked.clear(), 1000)
    socket.on('message', (message: Buffer, from: RemoteInfo) => {
        const count = (asked.get(from.address) ?? 0) + 1
        asked.set(from.address, count)
        if (count > most) return
        const answer = answerTo(message, from)
        if (answer) socket.send(answer, from.port, from.address)
    })
    socket.on('error', () => undefined)
    return new Promise((resolve, reject) => {
        socket.once('error', reject)
        socket.bind(options.port, options.host ?? '0.0.0.0', () => {
            socket.removeListener('error', reject)
            resolve({
                port: socket.address().port,
                close: () =>
                    new Promise<void>((done) => {
                        clearInterval(counting)
                        socket.close(() => done())
                    }),
            })
        })
    })
}
