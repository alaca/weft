import { describe, expect, it } from 'vitest'
import { inSharedRoom, type From, type Rooms } from '../../src/engine/room'

const note = (roomsize?: number, more: Record<string, unknown> = {}) => ({ s: 'triangle', room: 0.3, ...(roomsize === undefined ? {} : { roomsize }), ...more })
// Two patterns as they stand in the code, in a song whose bars are two seconds long.
const one: From = { name: 'one', place: 0 }
const two: From = { name: 'two', place: 1 }
const BAR = 2
// The size a note of a pattern is played in.
const played = (rooms: Rooms, from: From, size: number, time: number, bar = BAR) => inSharedRoom(rooms, note(size), time, from, bar).roomsize

describe('the room of a mixing channel', () => {
    it('hands a note on as it is when it asks for the size in use, or for no reverb', () => {
        const rooms: Rooms = new Map()
        const first = note(2)
        const second = note(2)
        const without = { s: 'triangle', roomsize: 6 }
        expect(inSharedRoom(rooms, first, 0, one, BAR)).toBe(first)
        expect(inSharedRoom(rooms, second, 0.25, one, BAR)).toBe(second)
        expect(inSharedRoom(rooms, without, 0.3, two, BAR)).toBe(without)
        expect(inSharedRoom(rooms, note(2), 0.5, one, BAR)).toEqual(note(2))
    })

    it('plays a pattern that asks for another size in the room of the pattern that stands first in the code', () => {
        const rooms: Rooms = new Map()
        const sizes: unknown[] = []
        for (let beat = 0; beat < 16; beat++) {
            sizes.push(played(rooms, one, 2, beat * 0.5))
            const other = note(6, { note: 'e4' })
            const fitted = inSharedRoom(rooms, other, beat * 0.5, two, BAR)
            expect(fitted).toEqual({ ...other, roomsize: 2 })
            expect(other.roomsize).toBe(6)
            sizes.push(fitted.roomsize)
        }
        expect(new Set(sizes)).toEqual(new Set([2]))
    })

    it('takes a new size of the pattern that has the room once the one in use has not been asked for in half a second', () => {
        const rooms: Rooms = new Map()
        played(rooms, one, 2, 0)
        played(rooms, one, 2, 0.25)
        expect(played(rooms, one, 6, 0.5)).toBe(2)
        expect(played(rooms, one, 6, 0.75)).toBe(2)
        expect(played(rooms, one, 6, 1)).toBe(6)
        expect(played(rooms, one, 2, 1.25)).toBe(6)
    })

    it('follows a knob that is turned without building the room at every note', () => {
        const rooms: Rooms = new Map()
        const sizes: unknown[] = []
        for (let at = 0; at < 40; at++) sizes.push(played(rooms, one, 2 + at / 10, at * 0.125))
        expect(new Set(sizes).size).toBe(8)
        for (let at = 40; at < 48; at++) sizes.push(played(rooms, one, 5.9, at * 0.125))
        expect(sizes[sizes.length - 1]).toBe(5.9)
    })

    it('follows the knob of the pattern that has the room and not the knob of another, however their notes fall between each other', () => {
        const rooms: Rooms = new Map()
        // Eighth notes of the one, and those of the other between them. The knob of the first is
        // turned after two seconds, the knob of the second after four.
        const sizes: unknown[] = []
        for (let eighth = 0; eighth < 48; eighth++) {
            const time = eighth * 0.25
            sizes.push(played(rooms, one, time < 2 ? 2 : 2.1, time))
            sizes.push(played(rooms, two, time < 4 ? 6 : 6.1, time + 0.125))
        }
        expect([...new Set(sizes)]).toEqual([2, 2.1])
        expect(sizes.indexOf(2.1)).toBeLessThanOrEqual(2 * (8 + 3))
    })

    it('stays as it is while patterns take turns in it more than half a second apart', () => {
        const turns: Rooms = new Map()
        const sizes: unknown[] = []
        for (let beat = 0; beat < 16; beat++) sizes.push(played(turns, beat % 2 ? two : one, beat % 2 ? 6 : 2, beat * 0.6, 2.4))
        expect(new Set(sizes)).toEqual(new Set([2]))

        // A chord at the start of every bar, and a line that plays the first half of each bar.
        const chords: Rooms = new Map()
        const heard: unknown[] = []
        for (let bar = 0; bar < 8; bar++) {
            heard.push(played(chords, one, 8, bar * BAR))
            for (let step = 0; step < 4; step++) heard.push(played(chords, two, 2, bar * BAR + step * 0.25))
        }
        expect(new Set(heard)).toEqual(new Set([8]))
    })

    it('goes to the next pattern two bars after the one that had it stopped, and back at once when that one plays again', () => {
        // Quarter notes in bars of one second. The first pattern rests in bars 3 to 6.
        const rests = (bar: number) => bar >= 2 && bar < 6
        const song = (rooms: Rooms, fromBar: number) => {
            const sizes: unknown[][] = []
            for (let bar = fromBar; bar < 8; bar++) {
                sizes[bar] = []
                for (let quarter = 0; quarter < 4; quarter++) {
                    const time = bar + quarter / 4
                    if (!rests(bar)) played(rooms, one, 2, time, 1)
                    sizes[bar].push(played(rooms, two, 6, time, 1))
                }
            }
            return sizes
        }
        const fromTheTop = song(new Map(), 0)
        expect(fromTheTop.slice(0, 4).flat()).toEqual(Array(16).fill(2))
        expect(fromTheTop.slice(4, 6).flat()).toEqual(Array(8).fill(6))
        expect(fromTheTop.slice(6).flat()).toEqual(Array(8).fill(2))
        // Listened to from the bar in which the first pattern plays again, it is in the same room.
        expect(song(new Map(), 6).slice(6)).toEqual(fromTheTop.slice(6))
    })

    it('is the same whichever of two notes that sound nearly together is handed over first', () => {
        const inOrder: Rooms = new Map()
        played(inOrder, one, 6, 0.14)
        played(inOrder, two, 2, 0.125)
        const sorted: Rooms = new Map()
        played(sorted, two, 2, 0.125)
        played(sorted, one, 6, 0.14)
        for (const rooms of [inOrder, sorted]) {
            expect(played(rooms, two, 2, 0.375)).toBe(6)
            expect(played(rooms, one, 6, 0.39)).toBe(6)
        }
    })

    it('keeps the rooms of two mixing channels apart', () => {
        const rooms: Rooms = new Map()
        played(rooms, one, 2, 0)
        expect(inSharedRoom(rooms, note(6, { orbit: 2 }), 0, two, BAR).roomsize).toBe(6)
        expect(inSharedRoom(rooms, note(6, { orbit: 1 }), 0, two, BAR).roomsize).toBe(2)
    })

    it('leaves a note that names no size as it is, and gives the first note that names one its size at once', () => {
        const rooms: Rooms = new Map()
        const plain = note()
        expect(inSharedRoom(rooms, plain, 0, one, BAR)).toBe(plain)
        expect(played(rooms, two, 3, 0)).toBe(3)
        expect(inSharedRoom(rooms, note(), 0.1, one, BAR)).toEqual(note())
        expect(played(rooms, two, 5, 0.2)).toBe(3)
    })

    it('lifts a size of nothing to the smallest room there is, so that the note is not lost', () => {
        const rooms: Rooms = new Map()
        const least = played(rooms, one, 0, 0) as number
        expect(least).toBeGreaterThan(0)
        expect(least).toBeLessThan(0.1)
        expect(played(rooms, one, 0, 0.25)).toBe(least)
    })
})
