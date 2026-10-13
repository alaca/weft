import { meterNow } from '../song/meter'
import { nearestInKey } from '../song/scales'
import { DEMO } from '../demo/demo'
import { canHearMidi, drumFor, hearMidi, readKey } from '../library/midi'
import { readKit } from '../song/kit'
import { bpm, midiKeyboards, patternKeys, pianoFor, pianoOctave, pianoWrites, selected, setMidiKeyboards, setPianoFor, setPianoOctave, song, stale } from '../stores/song'
import { previewSound, putNote, resizeNoteTo, rollPlace, soundNote } from './controller'

// A pattern of notes played from the computer's keyboard. The two rows of letters are the keys
// of a piano, laid out the way most music programs do it: A S D F G H J K are the white keys
// from c up to the next c, W E T Y U the black ones between them, and Z and X go an octave down
// and up. The keys are taken by where they are on the keyboard, not by the letter on them, so
// the piano is the same on every layout.
//
// While the song plays and writing is on, a note is written into the pattern's roll at the
// step it was played on, and is as long as its key was held.
const NOTES: Record<string, number> = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15 }
const LOWEST = 0
const HIGHEST = 7

type Held = { id: string; midi: number; start: number | null; at: number; perCycle: number; room: number }
const held = new Map<string, Held>()

// Typing is typing: in the code, in a box, in a window that asks something.
const typing = (event: KeyboardEvent) => Boolean((event.target as HTMLElement | null)?.closest('input, textarea, select, .cm-editor, [role="dialog"], [contenteditable]'))

export const firstNote = (): number => 12 * (pianoOctave() + 1)

// A key goes down: its note sounds, and is written when the song plays and writing is on.
// `key` is what tells this key from every other that is held, and `force` how hard it was
// pressed, where the keyboard says.
function down(key: string, id: string, note: number, force?: number) {
    // A pattern that keeps to a key takes the nearest note of it, as its roll does.
    const midi = nearestInKey(note, patternKeys()[id] ?? null)
    soundNote(id, midi, force)
    const place = pianoWrites() && !stale() ? rollPlace(id) : null
    const written = place !== null && putNote(id, place.step, midi)
    held.set(key, { id, midi, start: written ? place.step : null, at: performance.now(), perCycle: place?.perCycle ?? 0, room: place ? place.steps - place.step : 0 })
}

// A key is let go: the note that was written for it is as long as the key was held.
function up(key: string): boolean {
    const was = held.get(key)
    if (!was) return false
    held.delete(key)
    if (was.start === null) return true
    const cycles = (((performance.now() - was.at) / 1000) * bpm()) / (60 * meterNow().quarters)
    const length = Math.min(was.room, Math.max(1, Math.round(cycles * was.perCycle)))
    if (length > 1) resizeNoteTo(was.id, { start: was.start, midi: was.midi }, length, true)
    return true
}

// Gives back whether the key was the piano's, so that nothing else is done with it.
export function pianoDown(event: KeyboardEvent): boolean {
    const id = pianoFor()
    if (!id || event.metaKey || event.ctrlKey || event.altKey || typing(event)) return false
    if (!song().patterns.some((block) => block.id === id)) {
        setPianoFor(null)
        return false
    }
    if (event.code === 'KeyZ' || event.code === 'KeyX') {
        if (!event.repeat) setPianoOctave(Math.min(HIGHEST, Math.max(LOWEST, pianoOctave() + (event.code === 'KeyX' ? 1 : -1))))
        return true
    }
    const above = NOTES[event.code]
    if (above === undefined) return false
    if (event.repeat || held.has(event.code)) return true
    down(event.code, id, firstNote() + above)
    return true
}

export const pianoUp = (event: KeyboardEvent): boolean => up(event.code)

// A MIDI keyboard plays the pattern whose Keys are on, and when none is, the pattern that is
// chosen: its notes when it plays notes, its rows when it is a drum grid. Only a pattern whose
// Keys are on is written into. The keys of a MIDI keyboard are the notes they are, so nothing
// here follows the octave of the computer's keyboard.
export function midiHeard(bytes: Uint8Array) {
    const key = readKey(bytes)
    if (!key) return
    const name = `midi:${key.note}`
    if (key.kind === 'up') return void up(name)
    const id = pianoFor() ?? selected()
    const block = id ? song().patterns.find((one) => one.id === id) : undefined
    if (!id || !block || held.has(name)) return
    const rows = readKit(block)?.rows.map((row) => row.sound)
    if (rows) {
        const sound = drumFor(key.note, rows)
        if (sound) previewSound(id, sound)
        return
    }
    if (id === pianoFor()) down(name, id, key.note, key.force)
    else soundNote(id, nearestInKey(key.note, patternKeys()[id] ?? null), key.force)
}

// Starts listening for MIDI keyboards, once. The desktop app does so when it starts. A browser
// asks whether the page may, so there it waits until a keyboard is asked for: Keys is switched
// on, or the sound settings are opened. The demo never listens.
let listening: Promise<boolean> | null = null

export function hearKeyboards(): Promise<boolean> {
    if (DEMO || !canHearMidi()) return Promise.resolve(false)
    listening ??= hearMidi({ message: midiHeard, keyboards: setMidiKeyboards })
        .then(() => {
            if (midiKeyboards() === null) setMidiKeyboards([])
            return true
        })
        .catch(() => {
            listening = null
            return false
        })
    return listening
}
