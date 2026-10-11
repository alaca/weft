import { createSocket } from 'node:dgram'
import { afterEach, describe, expect, it } from 'vitest'
import { answerTo, createStun, type Stun } from '../../server/stun'

let stun: Stun | null = null
afterEach(async () => {
    await stun?.close()
    stun = null
})

// A question as a browser asks it: a binding request with the cookie and a number of its own.
const question = (id = '0102030405060708090a0b0c') => Buffer.from(`000100002112a442${id}`, 'hex')

// What an answer says: the kind, the number, and the address with the mixing taken out again.
function read(answer: Buffer) {
    const mix = answer.subarray(4, 20)
    const value = answer.subarray(24)
    const address = [...value.subarray(4)].map((byte, at) => byte ^ mix[at])
    return { kind: answer.readUInt16BE(0), id: answer.subarray(8, 20).toString('hex'), attribute: answer.readUInt16BE(20), family: value[1], port: value.readUInt16BE(2) ^ 0x2112, address }
}

describe('telling a machine its address from outside', () => {
    it('answers a question with the address and port it came from, under the question\'s own number', () => {
        const told = read(answerTo(question(), { address: '203.0.113.7', port: 54321, family: 'IPv4' })!)
        expect(told).toEqual({ kind: 0x0101, id: '0102030405060708090a0b0c', attribute: 0x0020, family: 1, port: 54321, address: [203, 0, 113, 7] })
    })

    it('does the same for a long address', () => {
        const told = read(answerTo(question(), { address: '2001:db8::7', port: 4000, family: 'IPv6' })!)
        expect([told.family, told.port, told.address.length, told.address.slice(0, 4), told.address[15]]).toEqual([2, 4000, 16, [0x20, 0x01, 0x0d, 0xb8], 7])
    })

    it('says nothing to what is not such a question', () => {
        const from = { address: '203.0.113.7', port: 1, family: 'IPv4' }
        expect(answerTo(Buffer.from('hello'), from)).toBe(null)
        expect(answerTo(Buffer.from('000300002112a4420102030405060708090a0b0c', 'hex'), from)).toBe(null)
        expect(answerTo(Buffer.from('00010000deadbeef0102030405060708090a0b0c', 'hex'), from)).toBe(null)
        expect(answerTo(Buffer.from('000100082112a4420102030405060708090a0b0c', 'hex'), from)).toBe(null)
        expect(answerTo(Buffer.alloc(2000), from)).toBe(null)
    })

    it('answers over the network, and stops answering one sender who asks without end', async () => {
        stun = await createStun({ port: 0, host: '127.0.0.1', mostASecond: 3 })
        const client = createSocket('udp4')
        const answers: Buffer[] = []
        client.on('message', (message) => answers.push(message))
        await new Promise<void>((bound) => client.bind(0, '127.0.0.1', bound))
        for (let count = 0; count < 8; count++) client.send(question(), stun.port, '127.0.0.1')
        client.send(Buffer.from('not a question'), stun.port, '127.0.0.1')
        await new Promise((resolve) => setTimeout(resolve, 200))
        expect(answers).toHaveLength(3)
        expect(read(answers[0])).toMatchObject({ kind: 0x0101, port: client.address().port, address: [127, 0, 0, 1] })
        client.close()
    })
})
