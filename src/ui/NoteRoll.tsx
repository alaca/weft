import { batch, createMemo, createSignal, For, Show } from 'solid-js'
import { addNotesAt, chooseKey, convertNotes, hearNotes, moveNoteTo, newNoteLength, removeNoteAt, resizeNoteTo, setNotesLength, setNotesSteps } from '../app/controller'
import { NOTE_RESOLUTIONS, noteText, readNotes, resampleNotes, roomAt, type Note, type NoteRef } from '../song/notes'
import { chordOn, inKey, nearestInKey, ROOTS, SCALE_KINDS, SCALES, stepInKey, type ScaleKind } from '../song/scales'
import type { PatternBlock } from '../song/types'
import { noteName } from '../song/view'
import { gridNotes, patternKeys, pianoFor, pianoOctave, pianoWrites, rollRanges, setPianoFor, setPianoWrites, stale } from '../stores/song'
import { GridFooter } from './GridFooter'

const ROW = 10
const OCTAVE = 12
const BLACK_KEYS = [1, 3, 6, 8, 10]
const EDGE = 7
const EMPTY_RANGE = { low: 48, high: 60 }

type Drawn = { left: number; width: number; midi: number; start: number; length: number }
type Drag = { ref: NoteRef; resize: boolean; fromStep: number; fromMidi: number }
// A note that is being drawn on an empty place. It begins where the pointer went down. Until
// the pointer leaves that step it is as long as the last note made here, and from then on it
// ends under the pointer. It is written once, when the pointer is let go.
type Draw = { time: number; start: number; midis: number[]; length: number; dragged: boolean }
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
        if (!grid) return props.played.map((note) => ({ left: note.start, width: note.length, midi: Math.round(note.midi), start: -1, length: 0 }))
        const from = offset()
        const to = from + grid.perCycle
        return grid.notes
            .filter((note) => note.start < to && note.start + note.length > from)
            .map((note) => {
                const begin = Math.max(note.start, from)
                const end = Math.min(note.start + note.length, to)
                return { left: (begin - from) / grid.perCycle, width: (end - begin) / grid.perCycle, midi: note.midi, start: note.start, length: note.length }
            })
    }

    // The list is rebuilt on every edit and every evaluation. A note that did not change keeps
    // its object, so its button stays in the page and keeps the keyboard focus.
    let kept = new Map<string, Drawn>()
    const drawn = createMemo((): Drawn[] => {
        const next = new Map<string, Drawn>()
        const list = visible().map((note) => {
            const key = `${note.start}:${note.midi}:${note.length}:${note.left}:${note.width}`
            const same = next.has(key) ? note : (kept.get(key) ?? note)
            next.set(key, same)
            return same
        })
        kept = next
        return list
    })

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

    const focusNote = (ref: NoteRef) => queueMicrotask(() => gridEl.querySelector<HTMLElement>(`.nt[data-start="${ref.start}"][data-midi="${ref.midi}"]`)?.focus())

    const onPointerDown = (event: PointerEvent) => {
        if (stale() || event.button !== 0) return
        const { cell, note, resize } = hit(event)
        if (!source() && note) {
            convertNotes(props.id)
            return
        }
        if (!note) {
            const start = offset() + cell.step
            const midis = put(cell.midi).filter((midi) => room(start, midi) > 0)
            if (!midis.length) return
            hearNotes(props.id, midis)
            setHeld(range())
            setHeldPage(shown())
            setDraw({ time: cell.time, start, midis, length: newNoteLength(props.id), dragged: false })
            gridEl.setPointerCapture(event.pointerId)
            return
        }
        drag = { ref: { start: note.start, midi: note.midi }, resize, fromStep: offset() + cell.step, fromMidi: cell.midi }
        setHeld(range())
        setHeldPage(shown())
        gridEl.setPointerCapture(event.pointerId)
        focusNote(drag.ref)
    }

    const onPointerMove = (event: PointerEvent) => {
        const drawing = draw()
        if (drawing) {
            const at = offset() + cellOf(event).step
            if (!drawing.dragged && at === drawing.start) return
            const length = Math.max(1, at - drawing.start + 1)
            if (!drawing.dragged || length !== drawing.length) setDraw({ ...drawing, length, dragged: true })
            return
        }
        if (!drag) return
        const cell = cellOf(event)
        const at = offset() + cell.step
        if (drag.resize) {
            resizeNoteTo(props.id, drag.ref, Math.max(1, at - drag.ref.start + 1))
            return
        }
        const up = cell.midi - drag.fromMidi
        const to = { start: drag.ref.start + (at - drag.fromStep), midi: up ? toKey(drag.ref.midi + up) : drag.ref.midi }
        if (to.start === drag.ref.start && to.midi === drag.ref.midi) return
        if (moveNoteTo(props.id, drag.ref, to)) drag = { ...drag, ref: to, fromStep: at, fromMidi: to.midi === drag.ref.midi ? drag.fromMidi : cell.midi }
    }

    const finish = (keep: boolean) => {
        const drawing = draw()
        if (drag) focusNote(drag.ref)
        drag = null
        batch(() => {
            const span = drawing?.dragged ? drawing.length / perCycle() : undefined
            const added = drawing && keep ? addNotesAt(props.id, { page: shown(), time: drawing.time, midis: drawing.midis, span, heard: true }) : null
            setDraw(null)
            setHeld(null)
            setHeldPage(null)
            if (added) focusNote(added)
        })
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
            const next = moveNoteTo(props.id, ref, to)
            focusNote(next ?? ref)
        }
        const resized = (next: number) => {
            resizeNoteTo(props.id, ref, next)
            focusNote(ref)
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
        note.start < 0 ? `${noteName(note.midi)}, click to edit` : `${noteName(note.midi)}, step ${note.start + 1}, ${note.length} ${note.length === 1 ? 'step' : 'steps'}`

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
                        if (removeAt(event)) event.preventDefault()
                    }}
                    onKeyDown={onKeyDown}
                >
                    <For each={rows()}>{(midi, i) => <i class="nr-r" classList={{ bk: BLACK_KEYS.includes(midi % OCTAVE), c: midi % OCTAVE === 0, offkey: !inKey(midi, songKey()) }} style={{ top: `${i() * ROW}px` }} />}</For>
                    <For each={drawn()}>
                        {(note) => (
                            <button
                                class="nt"
                                classList={{ ro: note.start < 0 }}
                                data-start={note.start}
                                data-midi={note.midi}
                                data-length={note.length}
                                aria-label={label(note)}
                                disabled={stale()}
                                style={{ left: `${note.left * 100}%`, width: `${note.width * 100}%`, top: `${(range().high - note.midi) * ROW}px` }}
                            >
                                <Show when={note.start >= 0}>
                                    <i class="nt-h" />
                                </Show>
                            </button>
                        )}
                    </For>
                    <For each={sketch()}>{(note) => <i class="nd" style={{ left: `${note.left * 100}%`, width: `${note.width * 100}%`, top: `${(range().high - note.midi) * ROW}px` }} />}</For>
                    <Show when={props.playing}>
                        <div class="ph" style={{ left: `${props.position * 100}%` }} />
                    </Show>
                </div>
            </div>
            <GridFooter
                head={props.head}
                cycles={cycles()}
                perCycle={perCycle()}
                resolutions={NOTE_RESOLUTIONS}
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
                    title="Play this pattern on the computer's keyboard, as on a piano"
                    onClick={() => setPianoFor(pianoFor() === props.id ? null : props.id)}
                >
                    Keys
                </button>
                <Show when={pianoFor() === props.id}>
                    <button class="chip tgl" classList={{ on: pianoWrites() }} aria-pressed={pianoWrites()} aria-label="Write what is played" title="While the song plays, what you play is written into this roll" onClick={() => setPianoWrites(!pianoWrites())}>
                        Write
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
                    A S D F G H J K are the white keys from c{pianoOctave()} to c{pianoOctave() + 1}, W E T Y U the black ones between. Z and X go an octave down and up. {pianoWrites() ? 'While the song plays, what you play is written in.' : 'Nothing is written in: you only hear what you play.'}
                </p>
            </Show>
            <Show when={gridNotes()[props.id]}>
                <p class="rk-n">This pattern changes in a way a grid cannot show, so it cannot be edited here. Edit it in the code.</p>
            </Show>
        </div>
    )
}
