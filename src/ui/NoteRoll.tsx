import { batch, createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import { clipboard, registerEditor, setClipboard } from '../app/clip'
import {
    addNotesAt,
    canWriteNotes,
    chooseKey,
    convertNotes,
    hearNotes,
    moveNotesBy,
    moveNoteTo,
    newNoteLength,
    notesClip,
    pasteNotesAt,
    removeNoteAt,
    removeNotesAt,
    replayHeld,
    resizeNoteTo,
    setNoteGlides,
    setNoteLevels,
    setNotesLength,
    setNotesSteps,
} from '../app/controller'
import { noteKey } from '../song/clip'
import { stepKind } from '../song/grid'
import { glideFrom, levelAt, NOTE_RESOLUTIONS, noteText, readNotes, resampleNotes, roomAt, type Note, type NoteRef } from '../song/notes'
import { chordOn, inKey, nearestInKey, ROOTS, SCALE_KINDS, SCALES, stepInKey, type ScaleKind } from '../song/scales'
import type { PatternBlock } from '../song/types'
import { noteName } from '../song/view'
import { beatSteps, noteSteps, USUAL } from '../song/meter'
import { gridNotes, meter, midiKeyboards, patternKeys, pianoFor, pianoOctave, pianoWrites, rollRanges, setPianoFor, setPianoWrites, stale } from '../stores/song'
import { hearKeyboards } from '../app/piano'
import { GridFooter } from './GridFooter'
import { StepLane } from './StepLane'
import { asksForMenu } from './keys'

const ROW = 10
const OCTAVE = 12
const BLACK_KEYS = [1, 3, 6, 8, 10]
const EDGE = 7
const EMPTY_RANGE = { low: 48, high: 60 }

const LEVEL = stepKind('level')

// `level` is how loud the note is, which is how full its colour is.
type Drawn = { left: number; width: number; midi: number; start: number; length: number; level: number; glide?: boolean }
// `group` is the chosen notes, when the note that is dragged is one of several chosen.
type Drag = { ref: NoteRef; resize: boolean; fromStep: number; fromMidi: number; group: NoteRef[] | null }
// A box drawn with Shift held, in pixels within the roll.
type Box = { x: number; y: number; toX: number; toY: number }
// A note that is being drawn on an empty place. It begins where the pointer went down. Until
// the pointer leaves that step it is as long as the last note made here, and from then on it
// ends under the pointer. It is written once, when the pointer is let go.
type Draw = { x: number; time: number; start: number; midis: number[]; length: number; dragged: boolean }
// A click whose pointer slips less than this many pixels is still a click, not a note drawn.
const SLIP = 4
type Range = { low: number; high: number }

export function NoteRoll(props: {
    id: string
    block: PatternBlock
    head: HTMLElement
    played: { start: number; length: number; midi: number }[]
    playing: boolean
    position: number
    cycle: number
}) {
    let gridEl!: HTMLDivElement
    let drag: Drag | null = null
    let pointer = -1
    const [page, setPage] = createSignal(0)
    const [above, setAbove] = createSignal(0)
    const [below, setBelow] = createSignal(0)
    const source = createMemo(() => readNotes(props.block))
    const cycles = () => source()?.grid.cycles ?? 1
    const perCycle = () => source()?.grid.perCycle ?? 16
    // While anything is dragged the bar in sight stays, though the song goes on to the next.
    const [heldPage, setHeldPage] = createSignal<number | null>(null)
    const shown = () => Math.min(heldPage() ?? (props.playing ? props.cycle % cycles() : page()), cycles() - 1)
    const offset = () => shown() * perCycle()

    // A pattern written as silence has no notes to fit the rows to, so its rows are the ones it
    // was given when it was added, or an octave from c3. Before the first events of any other
    // pattern arrive, the same rows are only a stand-in and are dropped when the notes are known.
    const silent = () => noteText(props.block)?.text.trim() === '~'

    // Rows are added but never taken away, and none are added during a drag. A row that came or
    // went under the pointer would put the note it holds, or the next click, on another pitch.
    const fitted = createMemo((before: (Range & { empty: boolean }) | undefined) => {
        const grid = source()?.grid
        const pitches = grid ? grid.notes.map((note) => note.midi) : props.played.map((note) => Math.round(note.midi))
        if (!pitches.length) return before ?? { ...(rollRanges()[props.id] ?? EMPTY_RANGE), empty: !silent() }
        const low = Math.min(...pitches) - 2
        const high = Math.max(...pitches) + 2
        if (!before || before.empty) return { low, high: Math.max(high, low + OCTAVE), empty: false }
        return { low: Math.min(before.low, low), high: Math.max(before.high, high), empty: false }
    }, undefined)
    const [held, setHeld] = createSignal<Range | null>(null)
    const range = createMemo((): Range => held() ?? { low: Math.max(0, fitted().low - below()), high: Math.min(127, fitted().high + above()) })
    const rows = createMemo(() => Array.from({ length: range().high - range().low + 1 }, (_, i) => range().high - i))

    const visible = (): Drawn[] => {
        const grid = source()?.grid
        if (!grid) return props.played.map((note) => ({ left: note.start, width: note.length, midi: Math.round(note.midi), start: -1, length: 0, level: 1 }))
        const from = offset()
        const to = from + grid.perCycle
        return grid.notes
            .filter((note) => note.start < to && note.start + note.length > from)
            .map((note) => {
                const begin = Math.max(note.start, from)
                const end = Math.min(note.start + note.length, to)
                return { left: (begin - from) / grid.perCycle, width: (end - begin) / grid.perCycle, midi: note.midi, start: note.start, length: note.length, level: note.level ?? 1, glide: Boolean(note.glide) && begin === note.start }
            })
    }

    // The list is rebuilt on every edit and every evaluation. A note that did not change keeps
    // its object, so its button stays in the page and keeps the keyboard focus.
    let kept = new Map<string, Drawn>()
    const drawn = createMemo((): Drawn[] => {
        const next = new Map<string, Drawn>()
        const list = visible().map((note) => {
            const key = `${note.start}:${note.midi}:${note.length}:${note.left}:${note.width}:${note.level}:${note.glide}`
            const same = next.has(key) ? note : (kept.get(key) ?? note)
            next.set(key, same)
            return same
        })
        kept = next
        return list
    })

    // The level of the notes, step by step, under the roll: a bar for every step a note starts
    // on. It is shown once a note has a level of its own, as one played on a MIDI keyboard
    // has, and whenever it is asked for.
    const [levelsAsked, setLevelsAsked] = createSignal<boolean | null>(null)
    const levelsShown = () => Boolean(source()) && (levelsAsked() ?? Boolean(source()?.levels || source()?.stacked))
    // Where chosen notes start, the lane is theirs, so that one note of a chord can be made
    // louder or softer than the others.
    const [chosen, setChosen] = createSignal<Set<string>>(new Set())
    const chosenAt = (from: number, count: number): NoteRef[] =>
        (source()?.grid.notes ?? []).filter((note) => note.start >= from && note.start < from + count && chosen().has(noteKey(note))).map((note) => ({ start: note.start, midi: note.midi }))
    // Under it too, whether the note of each step slides in from the note before. Shown once a
    // note glides, and whenever it is asked for.
    const [glidesAsked, setGlidesAsked] = createSignal<boolean | null>(null)
    const glidesShown = () => Boolean(source()) && (glidesAsked() ?? Boolean(source()?.grid.notes.some((note) => note.glide)))
    const glideOff = () => Boolean(source()?.otherGlide || source()?.stacked)
    const glides = createMemo(() => {
        const notes = source()?.grid.notes ?? []
        const from = offset()
        return Array.from({ length: perCycle() }, (_, at) => ({ on: notes.some((note) => note.start === from + at && note.glide), can: glideFrom(notes, from + at) !== null }))
    })
    const levels = createMemo(() => {
        const notes = source()?.grid.notes ?? []
        const from = offset()
        return Array.from({ length: perCycle() }, (_, at) => {
            const mine = notes.filter((note) => note.start === from + at && chosen().has(noteKey(note)))
            return levelAt(mine.length ? mine : notes, from + at)
        })
    })
    const beat = () => beatSteps(perCycle()) ?? (perCycle() % 3 === 0 ? Math.max(3, perCycle() / 4) : 4)

    const cellOf = (event: MouseEvent) => {
        const box = gridEl.getBoundingClientRect()
        const time = Math.min(0.999999, Math.max(0, (event.clientX - box.left) / box.width))
        const row = Math.min(rows().length - 1, Math.max(0, Math.floor((event.clientY - box.top) / ROW)))
        return { time, step: Math.floor(time * perCycle()), midi: range().high - row }
    }

    // With a key chosen, a note can only be put on a note of the key: a click or a drag on any
    // other row lands on the closest one. A note that is already off the key stays where it is.
    // The key and the chords switch belong to this pattern's roll and to no other.
    const songKey = () => patternKeys()[props.id] ?? null
    const [chordClicks, setChordClicks] = createSignal(false)
    const toKey = (midi: number) => Math.min(127, Math.max(0, nearestInKey(midi, songKey())))
    // What a click on an empty place puts in: the note, or with chords switched on the chord
    // of the key that stands on it.
    const put = (midi: number) => {
        const key = songKey()
        return key && chordClicks() ? chordOn(midi, key).filter((note) => note <= 127) : [toKey(midi)]
    }

    const hit = (event: MouseEvent) => {
        const box = gridEl.getBoundingClientRect()
        const cell = cellOf(event)
        const note = drawn().find((candidate) => candidate.midi === cell.midi && cell.time >= candidate.left && cell.time < candidate.left + candidate.width)
        const fromEdge = note ? box.left + (note.left + note.width) * box.width - event.clientX : Infinity
        return { cell, note, resize: note !== undefined && fromEdge <= EDGE && note.width * box.width > EDGE * 2 }
    }

    const [draw, setDraw] = createSignal<Draw | null>(null)
    // How long a new note can be where it begins. A roll that is not written as a grid yet has
    // only what it plays to go by, which is counted here in the steps it is drawn with.
    const room = (start: number, midi: number) => {
        const grid = source()?.grid
        const around: Note[] = grid ? grid.notes : drawn().map((note) => ({ start: note.left * perCycle(), length: note.width * perCycle(), midi: note.midi }))
        return roomAt(around, start, midi, grid ? grid.steps : perCycle())
    }
    const sketch = createMemo(() => {
        const drawing = draw()
        if (!drawing) return []
        const from = offset()
        return drawing.midis.map((midi) => {
            const end = Math.min(drawing.start + Math.min(drawing.length, room(drawing.start, midi)), from + perCycle())
            return { midi, left: (drawing.start - from) / perCycle(), width: (end - drawing.start) / perCycle() }
        })
    })

    // Notes chosen together: by a box drawn with Shift held, by Shift and a click, or by Cmd A.
    // They are moved, copied, cut and taken out as one.
    const [box, setBox] = createSignal<Box | null>(null)
    const isChosen = (note: NoteRef) => chosen().has(noteKey(note))
    const chosenNotes = (): NoteRef[] => (source()?.grid.notes ?? []).filter(isChosen).map((note) => ({ start: note.start, midi: note.midi }))
    // A note that is gone, by an undo or a change in the code, is not chosen any more.
    createEffect(() => {
        const there = new Set((source()?.grid.notes ?? []).map(noteKey))
        const kept = [...chosen()].filter((key) => there.has(key))
        if (kept.length !== chosen().size) setChosen(new Set(kept))
    })
    const chooseIn = (drawnBox: Box) => {
        const width = gridEl.getBoundingClientRect().width || 1
        const from = Math.min(drawnBox.x, drawnBox.toX) / width
        const to = Math.max(drawnBox.x, drawnBox.toX) / width
        const high = range().high - Math.floor(Math.min(drawnBox.y, drawnBox.toY) / ROW)
        const low = range().high - Math.floor(Math.max(drawnBox.y, drawnBox.toY) / ROW)
        const inside = drawn().filter((note) => note.start >= 0 && note.midi >= low && note.midi <= high && note.left < to && note.left + note.width > from)
        setChosen(new Set([...chosen(), ...inside.map(noteKey)]))
    }
    const moveChosen = (refs: NoteRef[], by: number, to: (midi: number) => number, held: boolean) => {
        const moved = moveNotesBy(props.id, refs, by, to, held)
        if (moved) setChosen(new Set(moved.map(noteKey)))
        return moved
    }
    onCleanup(
        registerEditor(props.id, {
            selectAll: () => {
                const notes = source()?.grid.notes ?? []
                if (!notes.length) return false
                setChosen(new Set(notes.map(noteKey)))
                return true
            },
            copy: () => {
                const clip = notesClip(props.id, chosen())
                if (clip) setClipboard(clip)
                return clip !== null
            },
            cut: () => {
                const clip = notesClip(props.id, chosen())
                if (!clip) return false
                setClipboard(clip)
                removeNotesAt(props.id, chosen())
                return true
            },
            // Into the bar in sight; into the next one when that is the bar they came from.
            paste: () => {
                const clip = clipboard()
                if (!clip || clip.kind !== 'notes' || !source()) return false
                const bar = shown() + (clip.from.id === props.id && clip.from.bar === shown() ? clip.bars : 0)
                const added = pasteNotesAt(props.id, clip, bar)
                if (!added.length) return true
                if (bar !== shown() && !props.playing) setPage(Math.min(bar, cycles() - 1))
                setChosen(new Set(added.map(noteKey)))
                return true
            },
            remove: () => {
                if (!chosen().size) return false
                removeNotesAt(props.id, chosen())
                return true
            },
            clear: () => {
                if (!chosen().size) return false
                setChosen(new Set<string>())
                return true
            },
        }),
    )

    const focusNote = (ref: NoteRef) => queueMicrotask(() => gridEl.querySelector<HTMLElement>(`.nt[data-start="${ref.start}"][data-midi="${ref.midi}"]`)?.focus())

    const onPointerDown = (event: PointerEvent) => {
        if (stale() || event.button !== 0 || asksForMenu(event)) return
        const { cell, note, resize } = hit(event)
        if (!source() && note) {
            convertNotes(props.id)
            return
        }
        // Shift and a click on a note chooses it, or lets it go. Shift and a drag over the roll
        // draws a box, and the notes in it are chosen too.
        if (event.shiftKey && source()) {
            if (note && note.start >= 0) {
                const next = new Set(chosen())
                if (!next.delete(noteKey(note))) next.add(noteKey(note))
                setChosen(next)
                return
            }
            if (!note) {
                const area = gridEl.getBoundingClientRect()
                const x = event.clientX - area.left
                const y = event.clientY - area.top
                pointer = event.pointerId
                setBox({ x, y, toX: x, toY: y })
                setHeld(range())
                setHeldPage(shown())
                gridEl.setPointerCapture(event.pointerId)
                return
            }
        }
        // A pattern written some other way than as a grid counts its own steps, not the sixteen
        // it is drawn with here. A note for it is not drawn first: it goes in at once, on the
        // steps the pattern turns out to have.
        if (!note && !source() && !silent()) {
            addNotesAt(props.id, { page: shown(), time: cell.time, midis: put(cell.midi) })
            return
        }
        pointer = event.pointerId
        if (!note) {
            setChosen(new Set<string>())
            const start = offset() + cell.step
            const midis = put(cell.midi).filter((midi) => room(start, midi) > 0)
            if (!midis.length || (!source() && !canWriteNotes(props.id))) return
            hearNotes(props.id, midis)
            // The rows stay as they are while it is drawn, but the rows of a chord's upper notes
            // come first, or those notes would be drawn out of sight.
            setHeld({ low: Math.min(range().low, ...midis), high: Math.max(range().high, ...midis) })
            setHeldPage(shown())
            setDraw({ x: event.clientX, time: cell.time, start, midis, length: newNoteLength(props.id), dragged: false })
            gridEl.setPointerCapture(event.pointerId)
            return
        }
        const ref = { start: note.start, midi: note.midi }
        const group = chosen().size > 1 && isChosen(ref) ? chosenNotes() : null
        if (!group && note.start >= 0) setChosen(new Set([noteKey(ref)]))
        drag = { ref, resize: resize && !group, fromStep: offset() + cell.step, fromMidi: cell.midi, group }
        setHeld(range())
        setHeldPage(shown())
        gridEl.setPointerCapture(event.pointerId)
        focusNote(drag.ref)
    }

    const onPointerMove = (event: PointerEvent) => {
        const drawingBox = box()
        if (drawingBox) {
            const area = gridEl.getBoundingClientRect()
            setBox({ ...drawingBox, toX: Math.min(area.width, Math.max(0, event.clientX - area.left)), toY: Math.min(area.height - 1, Math.max(0, event.clientY - area.top)) })
            return
        }
        const drawing = draw()
        if (drawing) {
            const at = offset() + cellOf(event).step
            if (!drawing.dragged && (at === drawing.start || Math.abs(event.clientX - drawing.x) < SLIP)) return
            const length = Math.max(1, at - drawing.start + 1)
            if (!drawing.dragged || length !== drawing.length) setDraw({ ...drawing, length, dragged: true })
            return
        }
        if (!drag) return
        const cell = cellOf(event)
        const at = offset() + cell.step
        if (drag.resize) {
            resizeNoteTo(props.id, drag.ref, Math.max(1, at - drag.ref.start + 1), true)
            return
        }
        if (drag.group) {
            const by = at - drag.fromStep
            const up = cell.midi - drag.fromMidi
            if (!by && !up) return
            const key = songKey()
            const to = (midi: number) => (up ? Math.min(127, Math.max(0, nearestInKey(midi + up, key))) : midi)
            const moved = moveChosen(drag.group, by, to, true)
            if (moved) drag = { ...drag, group: moved, ref: { start: drag.ref.start + by, midi: to(drag.ref.midi) }, fromStep: at, fromMidi: cell.midi }
            return
        }
        const up = cell.midi - drag.fromMidi
        const to = { start: drag.ref.start + (at - drag.fromStep), midi: up ? toKey(drag.ref.midi + up) : drag.ref.midi }
        if (to.start === drag.ref.start && to.midi === drag.ref.midi) return
        if (moveNoteTo(props.id, drag.ref, to, true)) drag = { ...drag, ref: to, fromStep: at, fromMidi: to.midi === drag.ref.midi ? drag.fromMidi : cell.midi }
    }

    // Also when the menu opens over a drag: WebKit then never tells the page the pointer was let go.
    const finish = (keep: boolean) => {
        const drawnBox = box()
        if (drawnBox) {
            if (keep) chooseIn(drawnBox)
            batch(() => {
                setBox(null)
                setHeld(null)
                setHeldPage(null)
            })
            if (gridEl.hasPointerCapture(pointer)) gridEl.releasePointerCapture(pointer)
            return
        }
        const drawing = draw()
        if (drag) {
            focusNote(drag.ref)
            replayHeld()
        }
        drag = null
        batch(() => {
            const span = drawing?.dragged ? drawing.length / perCycle() : undefined
            const added = drawing && keep ? addNotesAt(props.id, { page: shown(), time: drawing.time, midis: drawing.midis, span, heard: true }) : null
            setDraw(null)
            setHeld(null)
            setHeldPage(null)
            if (added) focusNote(added)
        })
        if (gridEl.hasPointerCapture(pointer)) gridEl.releasePointerCapture(pointer)
    }

    const removeAt = (event: MouseEvent) => {
        const { note } = hit(event)
        if (!note || note.start < 0 || stale()) return false
        removeNoteAt(props.id, { start: note.start, midi: note.midi })
        return true
    }

    const onKeyDown = (event: KeyboardEvent) => {
        const el = (event.target as HTMLElement).closest<HTMLElement>('.nt')
        if (!el || stale() || !source()) return
        const ref = { start: Number(el.dataset.start), midi: Number(el.dataset.midi) }
        const length = Number(el.dataset.length)
        const moved = (to: NoteRef) => {
            const next = moveNoteTo(props.id, ref, to, event.repeat)
            focusNote(next ?? ref)
        }
        const resized = (next: number) => {
            resizeNoteTo(props.id, ref, next, event.repeat)
            focusNote(ref)
        }
        // The note with the keyboard is one of several chosen: the keys move or take out all of them.
        if (chosen().size > 1 && isChosen(ref) && !event.shiftKey) {
            const key = songKey()
            const all = chosenNotes()
            const moveAll = (by: number, to: (midi: number) => number) => {
                const moved = moveChosen(all, by, to, event.repeat)
                focusNote(moved ? { start: ref.start + by, midi: to(ref.midi) } : ref)
            }
            if (event.key === 'Delete' || event.key === 'Backspace') removeNotesAt(props.id, chosen())
            else if (event.key === 'ArrowRight') moveAll(1, (midi) => midi)
            else if (event.key === 'ArrowLeft') moveAll(-1, (midi) => midi)
            else if (event.key === 'ArrowUp') moveAll(0, (midi) => stepInKey(midi, 1, key))
            else if (event.key === 'ArrowDown') moveAll(0, (midi) => stepInKey(midi, -1, key))
            else return
            event.preventDefault()
            return
        }
        if (event.key === 'Delete' || event.key === 'Backspace') removeNoteAt(props.id, ref)
        else if (event.shiftKey && event.key === 'ArrowRight') resized(length + 1)
        else if (event.shiftKey && event.key === 'ArrowLeft') resized(length - 1)
        else if (event.key === 'ArrowRight') moved({ start: ref.start + 1, midi: ref.midi })
        else if (event.key === 'ArrowLeft') moved({ start: ref.start - 1, midi: ref.midi })
        else if (event.key === 'ArrowUp') moved({ start: ref.start, midi: stepInKey(ref.midi, 1, songKey()) })
        else if (event.key === 'ArrowDown') moved({ start: ref.start, midi: stepInKey(ref.midi, -1, songKey()) })
        else return
        event.preventDefault()
    }

    const label = (note: Drawn) =>
        note.start < 0 ? `${noteName(note.midi)}, click to edit` : `${noteName(note.midi)}, step ${note.start + 1}, ${note.length} ${note.length === 1 ? 'step' : 'steps'}${note.level === 1 ? '' : `, level ${note.level}`}`

    return (
        <div class="rk" onClick={(event) => event.stopPropagation()}>
            <div class="nr">
                <div class="nr-k" style={{ height: `${rows().length * ROW}px` }}>
                    <For each={rows()}>
                        {(midi, i) => (
                            <Show when={midi % OCTAVE === 0 || i() === 0 || i() === rows().length - 1}>
                                <span style={{ top: `${i() * ROW + ROW / 2}px` }}>{noteName(midi)}</span>
                            </Show>
                        )}
                    </For>
                </div>
                <div
                    class="nr-g"
                    ref={gridEl}
                    data-steps={perCycle()}
                    data-high={range().high}
                    data-low={range().low}
                    style={{ height: `${rows().length * ROW}px`, '--steps': perCycle() }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={() => finish(true)}
                    onPointerCancel={() => finish(false)}
                    onLostPointerCapture={() => finish(false)}
                    onDblClick={removeAt}
                    onContextMenu={(event) => {
                        finish(false)
                        if (removeAt(event)) event.preventDefault()
                    }}
                    onKeyDown={onKeyDown}
                >
                    <For each={rows()}>{(midi, i) => <i class="nr-r" classList={{ bk: BLACK_KEYS.includes(midi % OCTAVE), c: midi % OCTAVE === 0, offkey: !inKey(midi, songKey()) }} style={{ top: `${i() * ROW}px` }} />}</For>
                    <For each={drawn()}>
                        {(note) => (
                            <button
                                class="nt"
                                classList={{ ro: note.start < 0, sel: note.start >= 0 && isChosen(note), gl: note.glide }}
                                data-start={note.start}
                                data-midi={note.midi}
                                data-length={note.length}
                                data-level={note.level}
                                aria-label={label(note)}
                                disabled={stale()}
                                style={{ left: `${note.left * 100}%`, width: `${note.width * 100}%`, top: `${(range().high - note.midi) * ROW}px`, '--lv': Math.min(1, note.level) }}
                            >
                                <Show when={note.start >= 0}>
                                    <i class="nt-h" />
                                </Show>
                            </button>
                        )}
                    </For>
                    <Show when={box()}>
                        {(drawnBox) => (
                            <i
                                class="nr-box"
                                style={{
                                    left: `${Math.min(drawnBox().x, drawnBox().toX)}px`,
                                    top: `${Math.min(drawnBox().y, drawnBox().toY)}px`,
                                    width: `${Math.abs(drawnBox().toX - drawnBox().x)}px`,
                                    height: `${Math.abs(drawnBox().toY - drawnBox().y)}px`,
                                }}
                            />
                        )}
                    </Show>
                    <For each={sketch()}>{(note) => <i class="nd" style={{ left: `${note.left * 100}%`, width: `${note.width * 100}%`, top: `${(range().high - note.midi) * ROW}px` }} />}</For>
                    <Show when={props.playing && shown() === props.cycle % cycles()}>
                        <div class="ph" style={{ left: `${props.position * 100}%` }} />
                    </Show>
                </div>
                <Show when={levelsShown()}>
                    <span class="ln-n nr-ln">Level</span>
                    <StepLane
                        name={props.id}
                        kind={LEVEL}
                        hits={levels().map((level) => level !== null)}
                        values={levels().map((level) => level ?? 1)}
                        beat={beat()}
                        disabled={stale() || source()?.otherLevel}
                        empty="No note starts on this step"
                        onDraw={(from, values) => {
                            const only = chosenAt(offset() + from, values.length)
                            setNoteLevels(props.id, offset() + from, values, only.length ? only : undefined)
                        }}
                        onHold={(on) => setHeldPage(on ? shown() : null)}
                    />
                </Show>
                <Show when={glidesShown()}>
                    <span class="ln-n nr-ln">Glide</span>
                    <div class="prow gl-ln" role="group" aria-label={`Glide of ${props.id}, step by step`}>
                        <For each={Array.from({ length: Math.ceil(perCycle() / beat()) }, (_, group) => group)}>
                            {(group) => (
                                <div class="grp" style={{ '--in': beat() }}>
                                    <For each={Array.from({ length: beat() }, (_, inside) => group * beat() + inside)}>
                                        {(step) => (
                                            <button
                                                class="gb"
                                                classList={{ on: glides()[step]?.on }}
                                                aria-pressed={Boolean(glides()[step]?.on)}
                                                aria-label={`Glide into step ${offset() + step + 1} of ${props.id}`}
                                                title={glides()[step]?.can ? 'The note on this step slides in from the note before it' : 'Only a single note can slide in, from a note of another pitch'}
                                                disabled={stale() || glideOff() || !glides()[step]?.can}
                                                onClick={() => setNoteGlides(props.id, offset() + step, [!glides()[step]?.on])}
                                            >
                                                <svg viewBox="0 0 14 8" aria-hidden="true">
                                                    <path d="M1.5 6.5 6 6.5 9 1.5 12.5 1.5" />
                                                </svg>
                                            </button>
                                        )}
                                    </For>
                                </div>
                            )}
                        </For>
                    </div>
                </Show>
            </div>
            <GridFooter
                head={props.head}
                cycles={cycles()}
                perCycle={perCycle()}
                resolutions={meter() === USUAL ? NOTE_RESOLUTIONS : noteSteps(meter())}
                canUse={(resolution) => {
                    const grid = source()?.grid
                    return !grid || resampleNotes(grid, resolution) !== null
                }}
                shown={shown()}
                disabled={stale()}
                onPage={setPage}
                onLength={(length) => {
                    setPage(0)
                    setNotesLength(props.id, length)
                }}
                onSteps={(resolution) => setNotesSteps(props.id, resolution)}
            >
                <button class="addb" aria-label="Show higher notes" onClick={() => setAbove(above() + OCTAVE)}>
                    Higher
                </button>
                <button class="addb" aria-label="Show lower notes" onClick={() => setBelow(below() + OCTAVE)}>
                    Lower
                </button>
                <button
                    class="chip tgl"
                    classList={{ on: pianoFor() === props.id }}
                    aria-pressed={pianoFor() === props.id}
                    aria-label={`Play ${props.id} on the keyboard`}
                    title="Play this pattern on the computer's keyboard, as on a piano, or on a MIDI keyboard"
                    onClick={() => {
                        setPianoFor(pianoFor() === props.id ? null : props.id)
                        void hearKeyboards()
                    }}
                >
                    Keys
                </button>
                <Show when={pianoFor() === props.id}>
                    <button class="chip tgl" classList={{ on: pianoWrites() }} aria-pressed={pianoWrites()} aria-label="Write what is played" title="While the song plays, what you play is written into this roll" onClick={() => setPianoWrites(!pianoWrites())}>
                        Write
                    </button>
                </Show>
                <Show when={source()}>
                    <button
                        class="chip tgl"
                        classList={{ on: levelsShown() }}
                        aria-pressed={levelsShown()}
                        aria-label={`Level of the notes of ${props.id}, step by step`}
                        title={source()?.otherLevel ? 'The code of this pattern sets the level of its notes in a way of its own, so it cannot be drawn here' : 'How loud each note is: draw it under the roll'}
                        onClick={() => setLevelsAsked(!levelsShown())}
                    >
                        Level
                    </button>
                    <button
                        class="chip tgl"
                        classList={{ on: glidesShown() }}
                        aria-pressed={glidesShown()}
                        aria-label={`Glide of the notes of ${props.id}, step by step`}
                        title={glideOff() ? 'This pattern bends its pitch in a way of its own, or plays chords whose notes are as loud as each was played, so its notes cannot glide here' : 'Notes that slide into their pitch from the note before, as on an acid bass line'}
                        onClick={() => setGlidesAsked(!glidesShown())}
                    >
                        Glide
                    </button>
                </Show>
                <span class="cap">Key</span>
                <select
                    class="pick"
                    aria-label="Scale this roll keeps to"
                    title="With a key chosen, the roll only takes the notes of that key"
                    onChange={(event) => {
                        const kind = event.currentTarget.value
                        chooseKey(props.id, kind ? { root: songKey()?.root ?? 0, kind: kind as ScaleKind } : null)
                    }}
                >
                    <option value="" selected={songKey() === null}>
                        Any note
                    </option>
                    <For each={SCALE_KINDS}>
                        {(kind) => (
                            <option value={kind} selected={songKey()?.kind === kind}>
                                {SCALES[kind].label}
                            </option>
                        )}
                    </For>
                </select>
                <Show when={songKey()}>
                    {(key) => (
                        <select class="pick" aria-label="First note of the key" onChange={(event) => chooseKey(props.id, { root: Number(event.currentTarget.value), kind: key().kind })}>
                            <For each={ROOTS}>
                                {(name, at) => (
                                    <option value={at()} selected={key().root === at()}>
                                        {name}
                                    </option>
                                )}
                            </For>
                        </select>
                    )}
                </Show>
                <Show when={songKey()}>
                    <button
                        class="chip tgl"
                        classList={{ on: chordClicks() }}
                        aria-pressed={chordClicks()}
                        title="A click puts in the whole chord of the key that stands on that note"
                        onClick={() => setChordClicks(!chordClicks())}
                    >
                        Chords
                    </button>
                </Show>
            </GridFooter>
            <Show when={pianoFor() === props.id}>
                <p class="rk-n" data-testid="piano-note">
                    A S D F G H J K are the white keys from c{pianoOctave()} to c{pianoOctave() + 1}, W E T Y U the black ones between. Z and X go an octave down and up.{' '}
                    <Show when={midiKeyboards()?.length}>A MIDI keyboard plays it too, each key the note it is. </Show>
                    {pianoWrites() ? 'While the song plays, what you play is written in.' : 'Nothing is written in: you only hear what you play.'}
                </p>
            </Show>
            <Show when={gridNotes()[props.id]}>
                <p class="rk-n">This pattern changes in a way a grid cannot show, so it cannot be edited here. Edit it in the code.</p>
            </Show>
        </div>
    )
}
