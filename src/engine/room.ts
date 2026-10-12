// Strudel keeps one reverb for each mixing channel, and builds it again from nothing whenever a
// note asks for another Room size than the one it has: a stretch of work on the window's
// thread, after which what still rang in the room is gone. Two patterns on one channel that
// ask for different sizes would have it built again at every note. So a channel keeps the size
// it has for as long as notes go on asking for it, and a note that asks for another is played
// in the room as it is. Only when nothing has asked for the size in use for a moment does the
// next note get its own: that is how a knob that is turned is followed, and how a pattern that
// is left alone on its channel gets the room it asks for.
export type Rooms = Map<string, { size: number | undefined; asked: number }>

// How long the size in use goes on holding after the last note that asked for it, in
// thousandths of a second of the notes' own time.
const HOLD = 500
// A room of no size at all cannot be built, and the note that asked for it would be lost.
const LEAST = 0.05

type Sound = { room?: unknown; roomsize?: unknown; orbit?: unknown }

// The note as it is handed on: itself when its room is the one it asks for, or a copy that asks
// for the size in use. `time` is when the note sounds, in seconds.
export function inSharedRoom<T extends Sound>(rooms: Rooms, value: T, time: number): T {
    if (!(Number(value.room) > 0)) return value
    const channel = String(value.orbit === undefined ? 1 : value.orbit)
    const room = rooms.get(channel)
    const named = value.roomsize === undefined || value.roomsize === null ? NaN : Number(value.roomsize)
    // A note that names no size plays in the room as it is, and leaves the size to be chosen.
    if (!Number.isFinite(named)) {
        if (!room) rooms.set(channel, { size: undefined, asked: -Infinity })
        return value
    }
    const size = Math.max(LEAST, named)
    // The copy names the size in use, where it could leave the size out: Strudel also builds the
    // room again when another setting of it differs, and a note without a size then gets the
    // usual size and not the one in use.
    const sized =(given: number): T => (given === value.roomsize ? value : { ...value, roomsize: given })
    if (room && room.size !== undefined && room.size !== size && Math.round((time - room.asked) * 1000) <= HOLD) return sized(room.size)
    rooms.set(channel, { size, asked: room?.size === size ? Math.max(room.asked, time) : time })
    return sized(size)
}
