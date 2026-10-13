import { describe, expect, it } from 'vitest'
import { DRUM_CHANNEL, readMidiFile, writeMidiFile, type MidiSong } from '../../src/library/midifile'
import { analyze } from '../../src/song/analyze'
import { songFromMidi } from '../../src/song/fromMidi'
import { readKit } from '../../src/song/kit'
import { readNotes } from '../../src/song/notes'

const PPQ = 480
const BAR = PPQ * 4
const song = (): MidiSong => ({
    ppq: PPQ,
    tempos: [
        { tick: 0, bpm: 124 },
        { tick: BAR * 2, bpm: 140 },
    ],
    meter: [4, 4],
    tracks: [
        {
            name: 'Lead',
            channel: 0,
            notes: [
                { tick: 0, length: 240, note: 60, force: 100 },
                { tick: 480, length: 480, note: 64, force: 80 },
                { tick: BAR + 960, length: 960, note: 67, force: 90 },
            ],
        },
        {
            name: 'Drums',
            channel: DRUM_CHANNEL,
            notes: [0, 480, 960, 1440].map((tick) => ({ tick, length: 60, note: 36, force: 110 })).concat([{ tick: 480, length: 60, note: 38, force: 100 }]),
        },
    ],
})

describe('a MIDI file', () => {
    it('is written and read back as it was: the notes of every track, the tempo and how the bar is counted', () => {
        const bytes = writeMidiFile(song())
        expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd')
        const read = readMidiFile(bytes)!
        expect(read.ppq).toBe(PPQ)
        expect(read.meter).toEqual([4, 4])
        expect(read.tempos.map((tempo) => [tempo.tick, Math.round(tempo.bpm)])).toEqual([
            [0, 124],
            [BAR * 2, 140],
        ])
        expect(read.tracks.map((track) => [track.name, track.channel])).toEqual([
            ['Lead', 0],
            ['Drums', DRUM_CHANNEL],
        ])
        const inOrder = (notes: MidiSong['tracks'][number]['notes']) => [...notes].sort((a, b) => a.tick - b.tick || a.note - b.note)
        expect(read.tracks[0].notes).toEqual(song().tracks[0].notes)
        expect(inOrder(read.tracks[1].notes)).toEqual(inOrder(song().tracks[1].notes))
    })

    it('is not read when it is no MIDI file', () => {
        expect(readMidiFile(new Uint8Array([1, 2, 3]))).toBeNull()
        expect(readMidiFile(new TextEncoder().encode('setcpm(120/4)\n\nlead: note("c e g")\n'))).toBeNull()
    })

    it('with one track for several instruments is read as a track for each', () => {
        const mixed = song()
        mixed.tracks = [{ name: 'All', channel: 0, notes: mixed.tracks[0].notes }]
        const bytes = [...writeMidiFile(mixed)]
        // The same track once more, on the drum channel, as a file of one track would hold it.
        const read = readMidiFile(writeMidiFile({ ...mixed, tracks: [...mixed.tracks, { name: 'All', channel: DRUM_CHANNEL, notes: song().tracks[1].notes }] }))!
        expect(read.tracks.map((track) => track.channel)).toEqual([0, DRUM_CHANNEL])
        expect(bytes.length).toBeGreaterThan(40)
    })
})

describe('a song made from a MIDI file', () => {
    it('has a pattern for each track: a piano roll for an instrument, a drum grid for the drums', () => {
        const made = songFromMidi(song())!
        expect([made.bars, made.cut, made.patterns]).toEqual([2, false, 2])
        expect(made.code.startsWith('setcpm(124/4)\n')).toBe(true)
        const read = analyze(made.code)
        expect(read.error).toBeNull()
        expect(read.patterns.map((block) => block.id)).toEqual(['lead', 'drums'])
        const roll = readNotes(read.patterns[0])!
        expect([roll.grid.cycles, roll.grid.perCycle]).toEqual([2, 16])
        expect(roll.grid.notes).toEqual([
            { start: 0, length: 2, midi: 60 },
            { start: 4, length: 4, midi: 64 },
            { start: 24, length: 8, midi: 67 },
        ])
        const kit = readKit(read.patterns[1])!
        expect(kit.rows.map((row) => row.sound)).toEqual(['bd', 'sd'])
        expect([kit.cycles, kit.steps]).toEqual([2, 32])
        expect(kit.rows[0].steps.slice(0, 16).map(Number).join('')).toBe('1000100010001000')
        expect(kit.rows[1].steps.slice(0, 8).map(Number).join('')).toBe('00001000')
    })

    it('takes the first eight bars of a longer file, and says that it did', () => {
        const long = song()
        long.tracks[0].notes.push({ tick: BAR * 20, length: 480, note: 72, force: 100 })
        const made = songFromMidi(long)!
        expect([made.bars, made.cut]).toEqual([8, true])
    })

    it('is not made from a file with no notes', () => {
        expect(songFromMidi({ ...song(), tracks: [] })).toBeNull()
    })
})
