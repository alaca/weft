import { createMemo, createSignal, For, Show } from 'solid-js'
import { addNoteAt, chooseKey, convertNotes, moveNoteTo, removeNoteAt, resizeNoteTo, setNotesLength, setNotesSteps } from '../app/controller'
import { NOTE_RESOLUTIONS, noteText, readNotes, resampleNotes, type NoteRef } from '../song/notes'
import { inKey, nearestInKey, ROOTS, SCALE_KINDS, SCALES, stepInKey, type ScaleKind } from '../song/scales'
import type { PatternBlock } from '../song/types'
import { noteName } from '../song/view'
import { gridNotes, rollRanges, songKey, stale } from '../stores/song'
import { GridFooter } from './GridFooter'

const ROW = 10
const OCTAVE = 12
const BLACK_KEYS = [1, 3, 6, 8, 10]
const EDGE = 7
const EMPTY_RANGE = { low: 48, high: 60 }

type Drawn = { left: number; width: number; midi: number; start: number; length: number }
type Drag = { ref: NoteRef; resize: boolean; fromStep: number; fromMidi: number }
type Range = { low: number; high: number }

export function NoteRoll(props: {
    id: string
    block: PatternBlock
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
    const shown = () => (props.playing ? props.cycle % cycles() : Math.min(page(), cycles() - 1))
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
    const toKey = (midi: number) => Math.min(127, Math.max(0, nearestInKey(midi, songKey())))

    const hit = (event: MouseEvent) => {
        const box = gridEl.getBoundingClientRect()
        const cell = cellOf(event)
        const note = drawn().find((candidate) => candidate.midi === cell.midi && cell.time >= candidate.left && cell.time < candidate.left + candidate.width)
        const fromEdge = note ? box.left + (note.left + note.width) * box.width - event.clientX : Infinity
        return { cell, note, resize: note !== undefined && fromEdge <= EDGE && note.width * box.width > EDGE * 2 }
    }

    const focusNote = (ref: NoteRef) => queueMicrotask(() => gridEl.querySelector<HTMLElement>(`.nt[data-start="${ref.start}"][data-midi="${ref.midi}"]`)?.focus())

    const onPointerDown = (event: PointerEvent) => {
        if (stale() || event.button !== 0) return
        const { cell, note, resize } = hit(event)
        if (!source()) {
            if (note) convertNotes(props.id)
            else addNoteAt(props.id, { page: shown(), time: cell.time, midi: toKey(cell.midi) })
            return
        }
        if (!note) {
            const added = addNoteAt(props.id, { page: shown(), time: cell.time, midi: toKey(cell.midi) })
            if (added) focusNote(added)
            return
        }
        drag = { ref: { start: note.start, midi: note.midi }, resize, fromStep: offset() + cell.step, fromMidi: cell.midi }
        setHeld(range())
        gridEl.setPointerCapture(event.pointerId)
        focusNote(drag.ref)
    }

    const onPointerMove = (event: PointerEvent) => {
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

    const onPointerUp = () => {
        if (drag) focusNote(drag.ref)
        drag = null
        setHeld(null)
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
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onDblClick={removeAt}
                    onContextMenu={(event) => {
                        if (removeAt(event)) event.preventDefault()
                    }}
                    onKeyDown={onKeyDown}
                >
                    <For each={rows()}>{(midi, i) => <i class="nr-r" classList={{ bk: BLACK_KEYS.includes(midi % OCTAVE), c: midi % OCTAVE === 0, out: !inKey(midi, songKey()) }} style={{ top: `${i() * ROW}px` }} />}</For>
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
                    <Show when={props.playing}>
                        <div class="ph" style={{ left: `${props.position * 100}%` }} />
                    </Show>
                </div>
            </div>
            <GridFooter
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
                <span class="cap">Key</span>
                <select
                    class="pick"
                    aria-label="Scale of the song"
                    title="With a key chosen, the roll only takes the notes of that key"
                    onChange={(event) => {
                        const kind = event.currentTarget.value
                        chooseKey(kind ? { root: songKey()?.root ?? 0, kind: kind as ScaleKind } : null)
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
                        <select class="pick" aria-label="First note of the key" onChange={(event) => chooseKey({ root: Number(event.currentTarget.value), kind: key().kind })}>
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
            </GridFooter>
            <Show when={gridNotes()[props.id]}>
                <p class="rk-n">This pattern changes in a way a grid cannot show, so it cannot be edited here. Edit it in the code.</p>
            </Show>
        </div>
    )
}
