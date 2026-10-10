import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { applyEdits } from '../../src/song/edits'
import {
    addNote,
    formatNoteGrid,
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
} from '../../src/song/notes'

const first = (code: string) => analyze(code).patterns[0]
const BASS = 'bass: note(`\n  d2 _  ~  ~    f2 ~  ~  ~    ~  ~  ~  ~    a1 _  _  _\n`)\n  .s("sawtooth")\n'
const bassNotes = [
    { start: 0, length: 2, midi: 38 },
    { start: 4, length: 1, midi: 41 },
    { start: 12, length: 4, midi: 33 },
]

describe('parseNoteGrid', () => {
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
        expect(parseNoteGrid('~ ~ ~ ~')).toBeNull()
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
        expect(notesFromEvents(times([cycle([[1 / 3, 1 / 3, 'c3']])], 8))).toBeNull()
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
        const source = { grid: { notes, steps: 8, cycles: 2, perCycle: 4 }, from: text.from, to: text.to, slow: null }
        expect(applyEdits(code, noteEdits(block, source, notes, 8, 2))).toBe(
            'chords: note(`\n  c3 _  _  _    d3 _  _  _ ,\n  e3 _  _  _    f3 _  _  _\n`).slow(2)\n  .s("triangle")\n',
        )
    })
})
