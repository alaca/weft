import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { applyEdits } from '../../src/song/edits'
import {
    addNote,
    formatNoteGrid,
    levelOfForce,
    forceOfLevel,
    moveNote,
    noteEdits,
    notesFromEvents,
    noteText,
    parseNoteGrid,
    readNotes,
    removeNote,
    resampleNotes,
    resizeNote,
    resizeNotes,
    roomAt,
    setLevels,
} from '../../src/song/notes'

const first = (code: string) => analyze(code).patterns[0]
const BASS = 'bass: note(`\n  d2 _  ~  ~    f2 ~  ~  ~    ~  ~  ~  ~    a1 _  _  _\n`)\n  .s("sawtooth")\n'
const bassNotes = [
    { start: 0, length: 2, midi: 38 },
    { start: 4, length: 1, midi: 41 },
    { start: 12, length: 4, midi: 33 },
]

describe('parseNoteGrid', () => {
    it('takes one line of rests as an empty roll that keeps its number of steps', () => {
        expect(parseNoteGrid('~ ~ ~   ~ ~ ~   ~ ~ ~   ~ ~ ~')).toEqual({ notes: [], steps: 12 })
        expect(parseNoteGrid('~ ~ ~ ~, ~ ~ ~ ~')).toBeNull()
        expect(formatNoteGrid([], 12)).toBe('`\n  ~ ~ ~   ~ ~ ~   ~ ~ ~   ~ ~ ~\n`')
        expect(formatNoteGrid([], 16)).toBe('"~"')
        expect(formatNoteGrid([], 32, 16)).toBe('`\n  ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~\n`')
    })

    it('reads notes, silences and holds', () => {
        expect(parseNoteGrid('d2 _ ~ ~ f2 ~ ~ ~ ~ ~ ~ ~ a1 _ _ _')).toEqual({ notes: bassNotes, steps: 16 })
    })

    it('reads several voices', () => {
        const grid = parseNoteGrid('c3 _ _ _, e3 _ _ _, g3 _ ~ ~')!
        expect(grid.notes).toEqual([
            { start: 0, length: 4, midi: 48 },
            { start: 0, length: 4, midi: 52 },
            { start: 0, length: 2, midi: 55 },
        ])
    })

    it('reads sharps and flats', () => {
        expect(parseNoteGrid('c#3 ~ eb3 ~')!.notes.map((n) => n.midi)).toEqual([49, 51])
    })

    it('refuses anything a note grid cannot hold', () => {
        expect(parseNoteGrid('d2 ~ d2 f2 ~ d2 a1 [c2 d2]')).toBeNull()
        expect(parseNoteGrid('c e g e')).toBeNull()
        expect(parseNoteGrid('c3 e3 g3')).toBeNull()
        expect(parseNoteGrid('_ c3 ~ ~')).toBeNull()
        expect(parseNoteGrid('c3 ~ ~ ~, e3 ~')).toBeNull()
        expect(parseNoteGrid('<c3 e3> ~ ~ ~')).toBeNull()
        expect(parseNoteGrid('bd ~ ~ ~')).toBeNull()
    })
})

describe('formatNoteGrid', () => {
    it('writes one voice on one aligned line', () => {
        expect(formatNoteGrid(bassNotes, 16)).toBe('`\n  d2 _  ~  ~    f2 ~  ~  ~    ~  ~  ~  ~    a1 _  _  _\n`')
    })

    it('puts notes that sound together on separate lines, lowest first', () => {
        const chord = [
            { start: 0, length: 4, midi: 55 },
            { start: 0, length: 4, midi: 48 },
            { start: 0, length: 4, midi: 52 },
        ]
        expect(formatNoteGrid(chord, 4)).toBe('`\n  c3 _  _  _ ,\n  e3 _  _  _ ,\n  g3 _  _  _\n`')
    })

    it('keeps a melody on its line when a note is laid over it', () => {
        const melody = [48, 52, 55, 52].map((midi, start) => ({ start, length: 1, midi }))
        expect(formatNoteGrid([...melody, { start: 1, length: 1, midi: 72 }], 4)).toBe('`\n  c3 e3 g3 e3 ,\n  ~  c5 ~  ~\n`')
    })

    it('pads every cell to the longest name', () => {
        expect(formatNoteGrid([{ start: 1, length: 2, midi: 49 }], 4)).toBe('`\n  ~   c#3 _   ~\n`')
    })

    it('reads back what it wrote', () => {
        const text = formatNoteGrid(bassNotes, 16)
        expect(parseNoteGrid(text.slice(1, -1))).toEqual({ notes: bassNotes, steps: 16 })
    })

    it('writes a single rest when there are no notes', () => {
        expect(formatNoteGrid([], 16)).toBe('"~"')
    })
})

describe('readNotes', () => {
    it('reads the note grid of a pattern', () => {
        const source = readNotes(first(BASS))!
        expect(source.grid).toEqual({ notes: bassNotes, steps: 16, cycles: 1, perCycle: 16 })
        expect(source.slow).toBeNull()
    })

    it('reads the length from slow', () => {
        const source = readNotes(first('x: note("c3 _ _ _ e3 _ _ _").slow(2)'))!
        expect(source.grid).toMatchObject({ steps: 8, cycles: 2, perCycle: 4 })
    })

    it('is not a note grid when the text is compact or the source is not note', () => {
        expect(readNotes(first('x: note("c e g e")'))).toBeNull()
        expect(readNotes(first('x: s("bd ~ ~ ~")'))).toBeNull()
        expect(readNotes(first('x: n("0 2 4 2").scale("C:major")'))).toBeNull()
    })
})

describe('noteText', () => {
    it('gives the text of a note source only', () => {
        expect(noteText(first('x: note("c e g").s("sawtooth")'))?.text).toBe('c e g')
        expect(noteText(first('x: n("0 2")'))).toBeNull()
        expect(noteText(first('x: s("bd")'))).toBeNull()
    })
})

describe('changing notes', () => {
    it('adds a note and keeps the list in order', () => {
        const next = addNote(bassNotes, { start: 8, length: 1, midi: 40 }, 16)!
        expect(next.map((n) => n.start)).toEqual([0, 4, 8, 12])
    })

    it('shortens a new note that would run past the end', () => {
        expect(addNote([], { start: 14, length: 4, midi: 60 }, 16)).toEqual([{ start: 14, length: 2, midi: 60 }])
    })

    it('refuses a note that overlaps one of the same pitch', () => {
        expect(addNote(bassNotes, { start: 1, length: 1, midi: 38 }, 16)).toBeNull()
        expect(addNote(bassNotes, { start: 1, length: 1, midi: 45 }, 16)).not.toBeNull()
    })

    it('knows how long a new note can be: to the next of its pitch, or to the end', () => {
        expect(roomAt(bassNotes, 8, 33, 16)).toBe(4)
        expect(roomAt(bassNotes, 8, 40, 16)).toBe(8)
        expect(roomAt(bassNotes, 1, 38, 16)).toBe(0)
        expect(roomAt(bassNotes, 2, 38, 16)).toBe(14)
    })

    it('removes a note', () => {
        expect(removeNote(bassNotes, { start: 4, midi: 41 }).map((n) => n.midi)).toEqual([38, 33])
    })

    it('moves a note in time and pitch', () => {
        const next = moveNote(bassNotes, { start: 4, midi: 41 }, { start: 5, midi: 42 }, 16)!
        expect(next).toContainEqual({ start: 5, length: 1, midi: 42 })
        expect(next).toHaveLength(3)
    })

    it('refuses a move off the grid or onto the same pitch', () => {
        expect(moveNote(bassNotes, { start: 12, midi: 33 }, { start: 13, midi: 33 }, 16)).toBeNull()
        expect(moveNote(bassNotes, { start: 4, midi: 41 }, { start: -1, midi: 41 }, 16)).toBeNull()
        expect(moveNote(bassNotes, { start: 4, midi: 41 }, { start: 1, midi: 38 }, 16)).toBeNull()
        expect(moveNote(bassNotes, { start: 9, midi: 41 }, { start: 5, midi: 41 }, 16)).toBeNull()
    })

    it('lengthens and shortens a note', () => {
        expect(resizeNote(bassNotes, { start: 4, midi: 41 }, 3, 16)).toContainEqual({ start: 4, length: 3, midi: 41 })
        expect(resizeNote(bassNotes, { start: 0, midi: 38 }, 1, 16)).toContainEqual({ start: 0, length: 1, midi: 38 })
    })

    it('refuses a length below one step or past the end', () => {
        expect(resizeNote(bassNotes, { start: 4, midi: 41 }, 0, 16)).toBeNull()
        expect(resizeNote(bassNotes, { start: 12, midi: 33 }, 5, 16)).toBeNull()
    })

    it('repeats the notes when the pattern gets longer and cuts them when shorter', () => {
        const grid = { notes: bassNotes, steps: 16, cycles: 1, perCycle: 16 }
        const longer = resizeNotes(grid, 2)
        expect(longer).toHaveLength(6)
        expect(longer.map((n) => n.start)).toEqual([0, 4, 12, 16, 20, 28])
        expect(resizeNotes({ notes: longer, steps: 32, cycles: 2, perCycle: 16 }, 1)).toEqual(bassNotes)
    })

    it('clips a note that crosses the new end', () => {
        const grid = { notes: [{ start: 2, length: 6, midi: 60 }], steps: 8, cycles: 2, perCycle: 4 }
        expect(resizeNotes(grid, 1)).toEqual([{ start: 2, length: 2, midi: 60 }])
    })

    it('makes the grid finer and coarser', () => {
        const grid = { notes: [{ start: 1, length: 2, midi: 60 }], steps: 4, cycles: 1, perCycle: 4 }
        const fine = resampleNotes(grid, 16)!
        expect(fine).toEqual([{ start: 4, length: 8, midi: 60 }])
        expect(resampleNotes({ notes: fine, steps: 16, cycles: 1, perCycle: 16 }, 4)).toEqual(grid.notes)
    })

    it('will not make the grid coarser when a note would not fit it', () => {
        expect(resampleNotes({ notes: bassNotes, steps: 16, cycles: 1, perCycle: 16 }, 4)).toBeNull()
    })

    it('goes to twelve steps when every note starts and ends on a beat, and not otherwise', () => {
        const onBeats = { notes: [{ start: 4, length: 8, midi: 60 }], steps: 16, cycles: 1, perCycle: 16 }
        expect(resampleNotes(onBeats, 12)).toEqual([{ start: 3, length: 6, midi: 60 }])
        expect(resampleNotes({ notes: [{ start: 2, length: 2, midi: 60 }], steps: 16, cycles: 1, perCycle: 16 }, 12)).toBeNull()
    })
})

describe('notesFromEvents', () => {
    const cycle = (events: [number, number, unknown][]) => events.map(([start, length, value]) => ({ start, length, value }))
    const times = <T>(list: T[], n: number) => Array.from({ length: n }, (_, i) => list[i % list.length])

    it('turns a line that repeats every cycle into the coarsest grid that fits', () => {
        const line = cycle([[0, 0.25, 'c4'], [0.25, 0.25, 'e4'], [0.5, 0.25, 'g4'], [0.75, 0.25, 'e4']])
        expect(notesFromEvents(times([line], 8))).toEqual({
            notes: [60, 64, 67, 64].map((midi, start) => ({ start, length: 1, midi })),
            cycles: 1,
            perCycle: 4,
        })
    })

    it('gives silence the sixteen steps an empty roll is drawn with', () => {
        expect(notesFromEvents(times([cycle([])], 8))).toEqual({ notes: [], cycles: 1, perCycle: 16 })
    })

    it('uses 16 steps when the line needs them', () => {
        const line = cycle([[0, 0.125, 'd2'], [0.875, 0.0625, 'c2'], [0.9375, 0.0625, 'd2']])
        const found = notesFromEvents(times([line], 8))!
        expect(found.perCycle).toBe(16)
        expect(found.notes).toEqual([
            { start: 0, length: 2, midi: 38 },
            { start: 14, length: 1, midi: 36 },
            { start: 15, length: 1, midi: 38 },
        ])
    })

    it('finds a pattern that repeats every four cycles', () => {
        const chords = [['d3', 'f3'], ['a#2', 'd3'], ['g3', 'a#3'], ['e3', 'g3']].map((names) => cycle(names.map((name) => [0, 1, name])))
        const found = notesFromEvents(times(chords, 8))!
        expect(found).toMatchObject({ cycles: 4, perCycle: 4 })
        expect(found.notes).toHaveLength(8)
        expect(found.notes[2]).toEqual({ start: 4, length: 4, midi: 46 })
    })

    it('reads note numbers and names without an octave', () => {
        const line = cycle([[0, 0.5, 60], [0.5, 0.5, 'e']])
        expect(notesFromEvents(times([line], 8))!.notes.map((n) => n.midi)).toEqual([60, 52])
    })

    it('refuses what does not repeat, does not fit a grid, or is not a note', () => {
        const a = cycle([[0, 1, 'c3']])
        const b = cycle([[0, 1, 'e3']])
        const c = cycle([[0, 1, 'g3']])
        expect(notesFromEvents([a, b, c, a, b, c, a, b])).toBeNull()
        expect(notesFromEvents(times([cycle([[1 / 5, 1 / 5, 'c3']])], 8))).toBeNull()
        // Thirds of a bar are held by twelve steps.
        expect(notesFromEvents(times([cycle([[1 / 3, 1 / 3, 'c3']])], 8))).toMatchObject({ perCycle: 12, notes: [{ start: 4, length: 4 }] })
        expect(notesFromEvents(times([cycle([[0, 1, 'bd']])], 8))).toBeNull()
        expect(notesFromEvents([a])).toBeNull()
    })
})

describe('noteEdits', () => {
    it('rewrites the grid text in place', () => {
        const block = first(BASS)
        const source = readNotes(block)!
        const notes = addNote(source.grid.notes, { start: 8, length: 1, midi: 40 }, 16)!
        expect(applyEdits(BASS, noteEdits(block, source, notes, 16, 1))).toBe(
            'bass: note(`\n  d2 _  ~  ~    f2 ~  ~  ~    e2 ~  ~  ~    a1 _  _  _\n`)\n  .s("sawtooth")\n',
        )
    })

    it('turns a compact line into a grid and adds slow when it spans several cycles', () => {
        const code = 'chords: note("<[c3,e3] [d3,f3]>")\n  .s("triangle")\n'
        const block = first(code)
        const text = noteText(block)!
        const notes = [
            { start: 0, length: 4, midi: 48 },
            { start: 0, length: 4, midi: 52 },
            { start: 4, length: 4, midi: 50 },
            { start: 4, length: 4, midi: 53 },
        ]
        const source = { grid: { notes, steps: 8, cycles: 2, perCycle: 4 }, from: text.from, to: text.to, slow: null, levels: null, otherLevel: false }
        expect(applyEdits(code, noteEdits(block, source, notes, 8, 2))).toBe(
            'chords: note(`\n  c3 _  _  _    d3 _  _  _ ,\n  e3 _  _  _    f3 _  _  _\n`).slow(2)\n  .s("triangle")\n',
        )
    })
})

describe('the level of the notes', () => {
    const edited = (code: string, change: (notes: ReturnType<typeof readNotes> & object) => { notes: Parameters<typeof noteEdits>[2]; cycles?: number }) => {
        const block = first(code)
        const source = readNotes(block)!
        const next = change(source)
        const cycles = next.cycles ?? source.grid.cycles
        return applyEdits(code, noteEdits(block, source, next.notes, source.grid.perCycle * cycles, cycles))
    }
    const LEAD = 'lead: note(`\n  c3 ~  e3 ~\n`).postgain("1 1 0.6 1")\n  .s("piano")\n'

    it('is read from a number for every step, and a note at 1 says nothing of it', () => {
        expect(readNotes(first(LEAD))?.grid.notes).toEqual([
            { start: 0, length: 1, midi: 48 },
            { start: 2, length: 1, midi: 52, level: 0.6 },
        ])
        const long = readNotes(first('lead: note(`\n  c3 ~  e3 ~    ~  ~  g3 ~\n`).slow(2).postgain("[1 1 0.6 1   1 1 1.2 1]/2")\n'))
        expect(long?.grid.notes.map((note) => note.level)).toEqual([undefined, 0.6, 1.2])
    })

    it('is left alone where the code sets it another way', () => {
        const code = 'lead: note(`\n  c3 ~  e3 ~\n`).postgain(0.5)\n'
        const source = readNotes(first(code))
        expect(source?.otherLevel).toBe(true)
        expect(source?.grid.notes.every((note) => note.level === undefined)).toBe(true)
        expect(edited(code, (from) => ({ notes: setLevels(from.grid.notes, 0, [0.5]) ?? [] }))).toBe('lead: note(`\n  c3 ~  e3 ~\n`).postgain(0.5)\n')
    })

    it('is written after the notes when one gets a level, changed where it stands, and taken out when every note is back at 1', () => {
        const plain = 'lead: note(`\n  c3 ~  e3 ~\n`)\n  .s("piano")\n'
        expect(edited(plain, (from) => ({ notes: setLevels(from.grid.notes, 2, [0.6])! }))).toBe(LEAD)
        expect(edited(LEAD, (from) => ({ notes: setLevels(from.grid.notes, 0, [0.8, 9, 2])! }))).toBe('lead: note(`\n  c3 ~  e3 ~\n`).postgain("0.8 1 1.5 1")\n  .s("piano")\n')
        expect(edited(LEAD, (from) => ({ notes: setLevels(from.grid.notes, 2, [1])! }))).toBe(plain)
        expect(setLevels(readNotes(first(LEAD))!.grid.notes, 1, [0.3])).toBeNull()
    })

    it('goes with the length of the pattern: after it, and as slow as it', () => {
        const two = edited(LEAD, (from) => ({ notes: resizeNotes(from.grid, 2), cycles: 2 }))
        expect(two).toBe('lead: note(`\n  c3 ~  e3 ~    c3 ~  e3 ~\n`).slow(2).postgain("[1 1 0.6 1   1 1 0.6 1]/2")\n  .s("piano")\n')
        expect(edited(two, (from) => ({ notes: resizeNotes(from.grid, 1), cycles: 1 }))).toBe(LEAD)
        const plain = 'lead: note(`\n  c3 ~  e3 ~\n`)\n'
        expect(edited(plain, (from) => ({ notes: setLevels(resizeNotes(from.grid, 2), 6, [0.5])!, cycles: 2 }))).toBe('lead: note(`\n  c3 ~  e3 ~    c3 ~  e3 ~\n`).slow(2).postgain("[1 1 1 1   1 1 0.5 1]/2")\n')
        const slow = 'lead: note(`\n  c3 ~  e3 ~    c3 ~  e3 ~\n`).slow(2)\n'
        expect(edited(slow, (from) => ({ notes: setLevels(resizeNotes(from.grid, 1), 0, [0.5])!, cycles: 1 }))).toBe('lead: note(`\n  c3 ~  e3 ~\n`).postgain("0.5 1 1 1")\n')
    })

    it('of a note put in by hand is that of the notes that start with it, a played one keeps its own, a moved one takes that of where it lands', () => {
        const notes = readNotes(first(LEAD))!.grid.notes
        expect(addNote(notes, { start: 2, length: 1, midi: 55 }, 4)?.map((note) => note.level)).toEqual([undefined, 0.6, 0.6])
        expect(addNote(notes, { start: 2, length: 1, midi: 55, level: 0.9 }, 4)?.map((note) => note.level)).toEqual([undefined, 0.6, 0.9])
        expect(addNote(notes, { start: 0, length: 1, midi: 55, level: 1 }, 4)?.map((note) => note.level)).toEqual([undefined, undefined, 0.6])
        expect(moveNote(notes, { start: 2, midi: 52 }, { start: 1, midi: 52 }, 4)).toEqual([
            { start: 0, length: 1, midi: 48 },
            { start: 1, length: 1, midi: 52, level: 0.6 },
        ])
        expect(moveNote(notes, { start: 2, midi: 52 }, { start: 0, midi: 52 }, 4)?.map((note) => note.level)).toEqual([undefined, undefined])
    })

    it('of each note of a chord is its own: the lines of notes are then stacked, each with its levels, and are one line again when the levels agree', () => {
        const plain = 'lead: note(`\n  c3 ~  e3 ~\n`)\n  .s("piano")\n'
        const chord = edited(plain, (from) => ({ notes: addNote(from.grid.notes, { start: 0, length: 1, midi: 55, level: 0.6 }, 4)! }))
        expect(chord).toBe('lead: stack(\n  note(`c3 ~  e3 ~`),\n  note(`g3 ~  ~  ~`).postgain("0.6 1 1 1"),\n)\n  .s("piano")\n')
        expect(readNotes(first(chord))!.grid.notes).toEqual([
            { start: 0, length: 1, midi: 48 },
            { start: 0, length: 1, midi: 55, level: 0.6 },
            { start: 2, length: 1, midi: 52 },
        ])
        const two = edited(chord, (from) => ({ notes: resizeNotes(from.grid, 2), cycles: 2 }))
        expect(two).toBe('lead: stack(\n  note(`c3 ~  e3 ~    c3 ~  e3 ~`),\n  note(`g3 ~  ~  ~    g3 ~  ~  ~`).postgain("0.6 1 1 1   0.6 1 1 1"),\n).slow(2)\n  .s("piano")\n')
        expect(readNotes(first(two))!.grid.notes.filter((note) => note.level === 0.6).map((note) => note.start)).toEqual([0, 4])
        // The Level lane changes one note of the chord when that one is chosen.
        const softer = edited(chord, (from) => ({ notes: setLevels(from.grid.notes, 0, [0.3], [{ start: 0, midi: 48 }])! }))
        expect(readNotes(first(softer))!.grid.notes.map((note) => note.level)).toEqual([0.3, 0.6, undefined])
        expect(edited(chord, (from) => ({ notes: setLevels(from.grid.notes, 0, [1])! }))).toBe('lead: note(`\n  c3 ~  e3 ~ ,\n  g3 ~  ~  ~\n`)\n  .s("piano")\n')
    })

    it('is how hard a key was pressed, 100 of 127 being a note put in by hand', () => {
        expect(levelOfForce(100 / 127)).toBe(1)
        expect(levelOfForce(64 / 127)).toBe(0.64)
        expect(levelOfForce(1)).toBe(1.27)
        expect([1, 0.64, 1.5, 0].map(forceOfLevel)).toEqual([100, 64, 127, 1])
    })
})
