import { nearestInKey } from '../song/scales'
import { bpm, patternKeys, pianoFor, pianoOctave, pianoWrites, setPianoFor, setPianoOctave, song, stale } from '../stores/song'
import { putNote, resizeNoteTo, rollPlace, soundNote } from './controller'

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
    // A pattern that keeps to a key takes the nearest note of it, as its roll does.
    const midi = nearestInKey(firstNote() + above, patternKeys()[id] ?? null)
    soundNote(id, midi)
    const place = pianoWrites() && !stale() ? rollPlace(id) : null
    const written = place !== null && putNote(id, place.step, midi)
    held.set(event.code, { id, midi, start: written ? place.step : null, at: performance.now(), perCycle: place?.perCycle ?? 0, room: place ? place.steps - place.step : 0 })
    return true
}

export function pianoUp(event: KeyboardEvent): boolean {
    const key = held.get(event.code)
    if (!key) return false
    held.delete(event.code)
    if (key.start === null) return true
    const cycles = (((performance.now() - key.at) / 1000) * bpm()) / 240
    const length = Math.min(key.room, Math.max(1, Math.round(cycles * key.perCycle)))
    if (length > 1) resizeNoteTo(key.id, { start: key.start, midi: key.midi }, length)
    return true
}
