import { mixText } from '../controls/catalog'
import { DRUM_CHANNEL, type MidiSong } from '../library/midifile'
import { LEVEL, type GridRow } from './grid'
import { kitText } from './kit'
import { meterNow, METERS, setMeterNow, USUAL, usualSteps, type Meter } from './meter'
import { formatNoteGrid, levelText, type Note } from './notes'
import { freeName, patternNameFrom } from './patterns'
import { barsText } from './bars'
import { ARRANGE } from './arrange'

// A MIDI file as a song: each of its tracks a pattern, the notes of an instrument in a piano
// roll and the notes of the drums in a drum grid, on the steps a bar of its time usually has. A
// pattern holds eight bars of four quarters at most, so a longer file is cut into parts of that
// many bars, each a pattern of its own that plays in its bars of the song. A part that is the
// same as one before it is that pattern again. Of a file longer than LONGEST bars the first are taken.
export const MOST_BARS = 8
const MOST_STEPS = 128
export const LONGEST = 256
// The sounds of a drum grid, by the note each has on the drum channel of every machine.
const DRUMS: Record<number, string> = { 35: 'bd', 36: 'bd', 37: 'rim', 38: 'sd', 39: 'cp', 40: 'sd', 41: 'lt', 42: 'hh', 43: 'lt', 44: 'hh', 45: 'mt', 46: 'oh', 47: 'mt', 48: 'ht', 49: 'cr', 50: 'ht', 51: 'rd', 56: 'cb', 70: 'sh' }
const ORDER = ['bd', 'sd', 'rim', 'cp', 'hh', 'oh', 'lt', 'mt', 'ht', 'cr', 'rd', 'cb', 'sh']
const LENGTHS = [1, 2, 4, 8]

export type FromMidi = { code: string; bars: number; cut: boolean; patterns: number }

const meterOf = (song: MidiSong): Meter => METERS.find((one) => one.label === `${song.meter[0]}/${song.meter[1]}`) ?? USUAL

// What writes a grid or a roll goes by the time of the song that is open. While this song is
// made it goes by the time of the file.
export function songFromMidi(song: MidiSong): FromMidi | null {
    const before = meterNow()
    setMeterNow(meterOf(song))
    try {
        return made(song, meterOf(song))
    } finally {
        setMeterNow(before)
    }
}

function made(song: MidiSong, meter: Meter): FromMidi | null {
    const STEPS = usualSteps(meter)
    // A file in a time the app does not have is read as bars of four quarters.
    const perBar = song.ppq * meter.quarters
    const last = Math.max(0, ...song.tracks.flatMap((track) => track.notes.map((note) => note.tick + note.length)))
    if (!last) return null
    const whole = Math.max(1, Math.ceil((last - 1) / perBar))
    const most = [...LENGTHS].reverse().find((length) => length <= MOST_BARS && length * STEPS <= MOST_STEPS) ?? 1
    const taken = Math.min(whole, LONGEST)
    const parts = Math.ceil(taken / most)
    // A part is as many bars as a pattern can be, the last as few as it can be and still hold its bars.
    const barsOfPart = (part: number) => LENGTHS.find((length) => length >= Math.min(most, taken - part * most)) ?? most
    const bars = parts === 1 ? barsOfPart(0) : taken
    const stepOf = (tick: number) => Math.round((tick / perBar) * STEPS)
    const bpm = Math.round(Math.min(300, Math.max(20, song.tempos[0]?.bpm ?? 120)))
    const names: string[] = []
    const patterns: string[] = []
    // How hard the keys were pressed becomes the level of the notes, 100 of 127 being the level
    // of a note put in by hand. A file that presses every key the same says nothing of it.
    const flat = new Set(song.tracks.flatMap((track) => track.notes.map((note) => note.force))).size < 2
    const levelOf = (force: number) => (flat ? 1 : Math.round(force) / 100)
    const mix = mixText().map((call) => `\n  ${call}`).join('')

    // What a pattern holds for a part of a track: its notes from the first step of the part on.
    const partText = (notesOfTrack: MidiSong['tracks'][number]['notes'], drums: boolean, part: number): string | null => {
        const length = barsOfPart(part)
        const steps = length * STEPS
        const first = part * most * STEPS
        const slow = length > 1 ? `.slow(${length})` : ''
        const within = notesOfTrack.flatMap((note) => {
            const step = stepOf(note.tick) - first
            return step >= 0 && step < steps ? [{ ...note, step }] : []
        })
        if (!within.length) return null
        if (drums) {
            const sounds = [...new Set(within.flatMap((note) => DRUMS[note.note] ?? []))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
            if (!sounds.length) return null
            const rows = sounds.map((sound): GridRow => {
                const row = Array<boolean>(steps).fill(false)
                const levels = Array<number>(steps).fill(1)
                for (const note of within) {
                    if (DRUMS[note.note] !== sound) continue
                    row[note.step] = true
                    levels[note.step] = levelOf(note.force)
                }
                return { sound, steps: row, ...(levels.some((level) => level !== 1) ? { lanes: { [LEVEL]: levels } } : {}) }
            })
            return `${kitText(rows)}${slow ? `\n  ${slow}` : ''}\n  .bank("RolandTR909")`
        }
        // Two notes of one pitch cannot lie over each other in a roll: the later one is kept
        // from where the earlier one ends. A note that rings on past its part ends with it.
        const notes: Note[] = []
        for (const note of [...within].sort((a, b) => a.step - b.step)) {
            const start = note.step
            const length = Math.max(1, Math.min(steps - start, Math.round((note.length / perBar) * STEPS)))
            const midi = Math.min(108, Math.max(12, note.note))
            const before = notes.find((other) => other.midi === midi && other.start + other.length > start)
            if (before) before.length = Math.max(1, start - before.start)
            if (before && before.start === start) continue
            notes.push({ start, length, midi, ...(levelOf(note.force) === 1 ? {} : { level: levelOf(note.force) }) })
        }
        const levels = levelText(notes, steps, length)
        return `note(${formatNoteGrid(notes, steps, STEPS)})${slow}${levels ? `.${LEVEL}("${levels}")` : ''}\n  .s("piano")${mix}`
    }

    for (const track of song.tracks) {
        const drums = track.channel === DRUM_CHANNEL
        // A name in small letters: Strudel takes one that begins with a capital S as played alone,
        // and one that begins with a line as muted.
        const said = patternNameFrom(track.name)?.toLowerCase().replace(/^_+/, '') || (drums ? 'drums' : 'track')
        // Each different part, with the bars of the song it plays in.
        const found = new Map<string, boolean[]>()
        for (let part = 0; part < parts; part++) {
            const text = partText(track.notes, drums, part)
            if (text === null) continue
            const playing = found.get(text) ?? Array<boolean>(taken).fill(false)
            for (let bar = part * most; bar < Math.min(taken, part * most + barsOfPart(part)); bar++) playing[bar] = true
            found.set(text, playing)
        }
        for (const [text, playing] of found) {
            const name = freeName(said, names)
            names.push(name)
            patterns.push(`${name}: ${text}${parts > 1 ? `\n  .${ARRANGE}("${barsText(playing)}")` : ''}`)
        }
    }
    if (!patterns.length) return null
    const time = meter === USUAL ? '' : `// time ${meter.label}\n`
    return { code: `setcpm(${bpm}/${meter.quarters})\n${time}\n${patterns.join('\n\n')}\n`, bars, cut: whole > taken, patterns: patterns.length }
}
