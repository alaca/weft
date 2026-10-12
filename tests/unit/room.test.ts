import { describe, expect, it } from 'vitest'
import { inSharedRoom, type Rooms } from '../../src/engine/room'

const note = (roomsize?: number, more: Record<string, unknown> = {}) => ({ s: 'triangle', room: 0.3, ...(roomsize === undefined ? {} : { roomsize }), ...more })

describe('the room of a mixing channel', () => {
    it('hands a note on as it is when it asks for the size in use, or for no reverb', () => {
        const rooms: Rooms = new Map()
        const first = note(2)
        const second = note(2)
        const without = { s: 'triangle', roomsize: 6 }
        expect(inSharedRoom(rooms, first, 0)).toBe(first)
        expect(inSharedRoom(rooms, second, 0.25)).toBe(second)
        expect(inSharedRoom(rooms, without, 0.3)).toBe(without)
        expect(inSharedRoom(rooms, note(2), 0.5)).toEqual(note(2))
    })

    it('plays a pattern that asks for another size in the room as it is, for as long as the first goes on asking', () => {
        const rooms: Rooms = new Map()
        const sizes: unknown[] = []
        for (let beat = 0; beat < 16; beat++) {
            sizes.push(inSharedRoom(rooms, note(2), beat * 0.5).roomsize)
            const other = note(6, { note: 'e4' })
            const played = inSharedRoom(rooms, other, beat * 0.5)
            expect(played).toEqual({ ...other, roomsize: 2 })
            expect(other.roomsize).toBe(6)
            sizes.push(played.roomsize)
        }
        expect(new Set(sizes)).toEqual(new Set([2]))
    })

    it('takes a new size once the one in use has not been asked for in half a second', () => {
        const rooms: Rooms = new Map()
        inSharedRoom(rooms, note(2), 0)
        inSharedRoom(rooms, note(2), 0.25)
        expect(inSharedRoom(rooms, note(6), 0.5).roomsize).toBe(2)
        expect(inSharedRoom(rooms, note(6), 0.75).roomsize).toBe(2)
        expect(inSharedRoom(rooms, note(6), 1).roomsize).toBe(6)
        expect(inSharedRoom(rooms, note(2), 1.25).roomsize).toBe(6)
    })

    it('follows a knob that is turned without building the room at every note', () => {
        const rooms: Rooms = new Map()
        const played: unknown[] = []
        for (let at = 0; at < 40; at++) played.push(inSharedRoom(rooms, note(2 + at / 10), at * 0.125).roomsize)
        expect(new Set(played).size).toBe(8)
        for (let at = 40; at < 48; at++) played.push(inSharedRoom(rooms, note(5.9), at * 0.125).roomsize)
        expect(played[played.length - 1]).toBe(5.9)
    })

    it('keeps the rooms of two mixing channels apart', () => {
        const rooms: Rooms = new Map()
        inSharedRoom(rooms, note(2), 0)
        expect(inSharedRoom(rooms, note(6, { orbit: 2 }), 0).roomsize).toBe(6)
        expect(inSharedRoom(rooms, note(6, { orbit: 1 }), 0).roomsize).toBe(2)
    })

    it('gives the first note that names a size its size at once, when the room was made by one that named none', () => {
        const rooms: Rooms = new Map()
        const plain = note()
        expect(inSharedRoom(rooms, plain, 0)).toBe(plain)
        expect(inSharedRoom(rooms, note(3), 0).roomsize).toBe(3)
        expect(inSharedRoom(rooms, note(), 0.1)).toEqual(note())
        expect(inSharedRoom(rooms, note(5), 0.2).roomsize).toBe(3)
    })

    it('lifts a size of nothing to the smallest room there is, so that the note is not lost', () => {
        const rooms: Rooms = new Map()
        const least = inSharedRoom(rooms, note(0), 0).roomsize as number
        expect(least).toBeGreaterThan(0)
        expect(least).toBeLessThan(0.1)
        expect(inSharedRoom(rooms, note(0), 0.25).roomsize).toBe(least)
    })
})
