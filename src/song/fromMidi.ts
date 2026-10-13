import { mixText } from '../controls/catalog'
import { DRUM_CHANNEL, type MidiSong } from '../library/midifile'
import { kitText } from './kit'
import { meterNow, METERS, setMeterNow, USUAL, usualSteps, type Meter } from './meter'
import { formatNoteGrid, type Note } from './notes'
import { freeName, patternNameFrom } from './patterns'

// A MIDI file as a song: each of its tracks a pattern, the notes of an instrument in a piano
// roll and the notes of the drums in a drum grid, on the steps a bar of its time usually has. A
// pattern holds eight bars of four quarters at most, so of a longer file the first bars are taken.
export const MOST_BARS = 8
const MOST_STEPS = 128
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
    const bars = LENGTHS.find((length) => length >= Math.min(whole, most)) ?? most
    const steps = bars * STEPS
    const stepOf = (tick: number) => Math.round((tick / perBar) * STEPS)
    const bpm = Math.round(Math.min(300, Math.max(20, song.tempos[0]?.bpm ?? 120)))
    const names: string[] = []
    const patterns: string[] = []
    const slow = bars > 1 ? `.slow(${bars})` : ''
    const mix = mixText().map((call) => `\n  ${call}`).join('')
    for (const track of song.tracks) {
        const within = track.notes.filter((note) => stepOf(note.tick) < steps)
        if (!within.length) continue
        const drums = track.channel === DRUM_CHANNEL
        // A name in small letters: Strudel takes one that begins with a capital S as played alone,
        // and one that begins with a line as muted.
        const said = patternNameFrom(track.name)?.toLowerCase().replace(/^_+/, '')
        const name = freeName(said || (drums ? 'drums' : 'track'), names)
        names.push(name)
        if (drums) {
            const sounds = [...new Set(within.flatMap((note) => DRUMS[note.note] ?? []))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
            if (!sounds.length) continue
            const rows = sounds.map((sound) => {
                const row = Array<boolean>(steps).fill(false)
                for (const note of within) if (DRUMS[note.note] === sound) row[stepOf(note.tick)] = true
                return { sound, steps: row }
            })
            patterns.push(`${name}: ${kitText(rows)}${slow ? `\n  ${slow}` : ''}\n  .bank("RolandTR909")`)
            continue
        }
        // Two notes of one pitch cannot lie over each other in a roll: the later one is kept
        // from where the earlier one ends.
        const notes: Note[] = []
        for (const note of [...within].sort((a, b) => a.tick - b.tick)) {
            const start = stepOf(note.tick)
            const length = Math.max(1, Math.min(steps - start, Math.round((note.length / perBar) * STEPS)))
            const midi = Math.min(108, Math.max(12, note.note))
            const before = notes.find((other) => other.midi === midi && other.start + other.length > start)
            if (before) before.length = Math.max(1, start - before.start)
            if (before && before.start === start) continue
            notes.push({ start, length, midi })
        }
        patterns.push(`${name}: note(${formatNoteGrid(notes, steps, STEPS)})${slow}\n  .s("piano")${mix}`)
    }
    if (!patterns.length) return null
    const time = meter === USUAL ? '' : `// time ${meter.label}\n`
    return { code: `setcpm(${bpm}/${meter.quarters})\n${time}\n${patterns.join('\n\n')}\n`, bars, cut: whole > bars, patterns: patterns.length }
}
