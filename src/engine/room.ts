// Strudel keeps one reverb for each mixing channel, and builds it again from nothing whenever a
// note asks for another Room size than the one it has: a stretch of work on the window's
// thread, after which what still rang in the room is gone. Two patterns on one channel that
// ask for different sizes would have it built again at every note. So the room of a channel
// belongs to one pattern at a time: of the patterns that sent a note into it in the last two
// bars, the one that stands first in the code. A note of another pattern is played in the room
// as it is. The pattern that has the room says how big it is, and the size in use holds for as
// long as its notes go on asking for it. Only when none of them has for a moment does its next
// note get its own: that is how a knob that is turned is followed.
// Who has the room follows from what plays, not from what played first or was handed over
// first, so that a song is in the same room from the middle as from the top, and in a file.
type Room = {
    size: number
    // The pattern that has the room, and when it last asked for the size in use.
    has: string
    asked: number
    // Where each pattern that sends into the room stands in the code, and when it last sent.
    sent: Map<string, { place: number; last: number }>
}
export type Rooms = Map<string, Room>

// The pattern a note is of, and where that pattern stands in the code.
export type From = { name: string; place: number }

// How long the size in use goes on holding after the last note of its pattern that asked for
// it, in thousandths of a second of the notes' own time.
const HOLD = 500
// How long a pattern that has stopped sending keeps the room, in bars.
const WAIT = 2
// A room of no size at all cannot be built, and the note that asked for it would be lost.
const LEAST = 0.05

type Sound = { room?: unknown; roomsize?: unknown; orbit?: unknown }

// The note as it is handed on: itself when its room is the one it asks for, or a copy that asks
// for the size in use. `time` is when the note sounds and `bar` how long a bar is, in seconds.
export function inSharedRoom<T extends Sound>(rooms: Rooms, value: T, time: number, from: From, bar: number): T {
    if (!(Number(value.room) > 0)) return value
    const named = value.roomsize === undefined || value.roomsize === null ? NaN : Number(value.roomsize)
    // A note that names no size plays in the room as it is, and has no say in its size.
    if (!Number.isFinite(named)) return value
    const channel = String(value.orbit === undefined ? 1 : value.orbit)
    const size = Math.max(LEAST, named)
    // The copy names the size in use, where it could leave the size out: Strudel also builds the
    // room again when another setting of it differs, and a note without a size then gets the
    // usual size and not the one in use.
    const sized = (given: number): T => (given === value.roomsize ? value : { ...value, roomsize: given })
    const room = rooms.get(channel)
    if (!room) {
        rooms.set(channel, { size, has: from.name, asked: time, sent: new Map([[from.name, { place: from.place, last: time }]]) })
        return sized(size)
    }
    room.sent.set(from.name, { place: from.place, last: Math.max(time, room.sent.get(from.name)?.last ?? time) })
    let first = from.place
    for (const [name, other] of room.sent) {
        if (Math.round((time - other.last - WAIT * bar) * 1000) > 0) room.sent.delete(name)
        else first = Math.min(first, other.place)
    }
    if (first < from.place) return sized(room.size)
    // A pattern that comes to the room gives it its size at once.
    if (room.has !== from.name) {
        room.has = from.name
        room.size = size
        room.asked = time
        return sized(size)
    }
    if (size !== room.size && Math.round((time - room.asked) * 1000) <= HOLD) return sized(room.size)
    room.asked = size === room.size ? Math.max(room.asked, time) : time
    room.size = size
    return sized(size)
}
