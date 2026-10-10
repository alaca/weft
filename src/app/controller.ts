import { batch, createEffect, createRoot } from 'solid-js'
import { FILTERS, filterTypeOf, findDef, writeNumber, type FilterType } from '../controls/catalog'
import { drumChoices } from '../controls/drums'
import { callFor } from '../controls/views'
import { createEngine } from '../engine/engine'
import { analyze } from '../song/analyze'
import { addCall, removeCall, renameCalls, setNumber, setString, setTempo as tempoEdit, toggleMute as muteEdit } from '../song/edits'
import { gridEdits, gridFromEvents, readGrid, removeRow, resample, resize, sourceText, toggleStep as toggleGridStep, type GridRow, type GridSource } from '../song/grid'
import {
    addNote,
    moveNote,
    noteEdits,
    notesFromEvents,
    noteText,
    readNotes,
    removeNote,
    resampleNotes,
    resizeNote,
    resizeNotes,
    type Note,
    type NoteRef,
    type NoteSource,
} from '../song/notes'
import { appendPattern, freeName, PATTERN_STARTERS, starterCode, type StarterKind } from '../song/patterns'
import { STARTER } from '../song/starter'
import type { PatternBlock, PatternEvent } from '../song/types'
import { fits, soundEdit } from '../sounds/apply'
import { catalogue, type SoundItem } from '../sounds/catalog'
import {
    engineState,
    gridNotes,
    openPanel,
    pinnedRows,
    selected,
    setBeat,
    setBpm,
    setCycle,
    setEngineState,
    setGridNotes,
    setMasterVolumeValue,
    setOpenPanel,
    setPinnedRows,
    setPosition,
    setRevision,
    setSelected,
    setSoloIds,
    setSong,
    setSoundsOpen,
    setStale,
    soloIds,
    song,
    soundsOpen,
    stale,
} from '../stores/song'

const STORAGE_KEY = 'weft.song'
const VOLUME_KEY = 'weft.volume'
const COLORS = ['var(--madder)', 'var(--saffron)', 'var(--woad)', 'var(--lichen)', 'var(--orchil)']

const engine = createEngine()
let saveTimer: number | undefined
let frame = 0

export const colorAt = (index: number) => COLORS[index % COLORS.length]

const find = (id: string) => song().patterns.find((p) => p.id === id)

function onCode(code: string) {
    const next = analyze(code)
    if (next.error) {
        setStale(true)
    } else {
        const ids = new Set(next.patterns.map((p) => p.id))
        const kept = soloIds().filter((id) => ids.has(id))
        batch(() => {
            setSong(next)
            setStale(false)
            if (kept.length !== soloIds().length) setSoloIds(kept)
        })
        if (kept.length !== soloIds().length) engine.setSolo(kept)
    }
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => localStorage.setItem(STORAGE_KEY, code), 500)
}

function tick() {
    const now = engine.now()
    const whole = Math.floor(now)
    batch(() => {
        setCycle(whole)
        setPosition(now - whole)
        setBeat(Math.min(3, Math.floor((now - whole) * 4)))
    })
    frame = requestAnimationFrame(tick)
}

export async function mount(root: HTMLElement): Promise<void> {
    const storedVolume = Number(localStorage.getItem(VOLUME_KEY) ?? '1')
    const startVolume = Number.isFinite(storedVolume) ? storedVolume : 1
    setMasterVolumeValue(startVolume)
    engine.setMasterVolume(startVolume)
    const initial = localStorage.getItem(STORAGE_KEY) ?? STARTER
    engine.onState((next) => {
        const wasPlaying = engineState().playing
        setEngineState(next)
        if (next.playing && !wasPlaying) {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(tick)
        }
        if (!next.playing && wasPlaying) {
            cancelAnimationFrame(frame)
            batch(() => {
                setCycle(0)
                setPosition(0)
                setBeat(0)
            })
        }
    })
    engine.onCodeChange(onCode)
    engine.onCursor((offset) => {
        if (stale()) return
        const hit = song().patterns.find((p) => offset >= p.from && offset <= p.to)
        if (hit) setSelected(hit.id)
    })
    engine.onEvaluated(() =>
        batch(() => {
            setRevision((r) => r + 1)
            setBpm(engine.bpm())
        }),
    )
    onCode(initial)
    await engine.mount(root, initial)
    createRoot(() => {
        createEffect(() => {
            const current = selected()
            const patterns = song().patterns
            if (stale()) return
            engine.markBlocks(
                patterns.map((p, i) => ({ from: p.from, to: p.to, color: colorAt(i), selected: p.id === current, muted: p.muted })),
            )
        })
    })
    if (import.meta.env.DEV) (window as any).__weft = { engine }
}

export const play = () => void engine.evaluate()

function replay() {
    if (engineState().playing) play()
    else void engine.refresh()
}

export const stop = () => engine.stop()

export const togglePlay = () => (engineState().playing ? stop() : play())

export function select(id: string) {
    const block = find(id)
    if (!block) return
    setSelected(id)
    if (!stale()) engine.reveal(block.from)
}

export function toggleMute(id: string) {
    const block = find(id)
    if (!block || stale()) return
    engine.applyEdit(muteEdit(block))
    replay()
}

export function toggleSolo(id: string) {
    const next = soloIds().includes(id) ? soloIds().filter((other) => other !== id) : [...soloIds(), id]
    setSoloIds(next)
    engine.setSolo(next)
}

export const eventsOf = (id: string, whichCycle: number): PatternEvent[] => engine.events(id, whichCycle)

let evaluateTimer: number | undefined

function scheduleEvaluate() {
    if (evaluateTimer !== undefined) return
    evaluateTimer = window.setTimeout(() => {
        evaluateTimer = undefined
        replay()
    }, 120)
}

export function setControl(id: string, fn: string, value: number) {
    const block = find(id)
    if (!block || stale()) return
    const arg = callFor(block, fn)?.args[0]
    if (!arg || (arg.kind !== 'number' && arg.kind !== 'slider')) return
    const def = findDef(fn)
    const min = arg.kind === 'slider' ? arg.min : Math.min(def?.min ?? 0, value)
    const max = arg.kind === 'slider' ? arg.max : Math.max(def?.max ?? 1, value)
    const text = writeNumber(Math.min(max, Math.max(min, value)), min, max)
    if (arg.kind === 'slider' && engine.moveSlider(arg.valueFrom, text)) return
    engine.applyEdit(setNumber(arg, text))
    scheduleEvaluate()
}

export function addControl(id: string, fn: string, value?: number) {
    const block = find(id)
    const def = findDef(fn)
    if (!block || !def || stale() || callFor(block, fn)) return
    const start = writeNumber(value ?? def.initial, def.min, def.max)
    engine.applyEdit(addCall(engine.getCode(), block, `.${def.fn}(slider(${start}, ${def.min}, ${def.max}))`))
    replay()
}

export function removeControl(id: string, fn: string) {
    const block = find(id)
    const call = block ? callFor(block, fn) : undefined
    if (!call || stale()) return
    engine.applyEdit(removeCall(call))
    replay()
}

export function setVolume(id: string, value: number) {
    const block = find(id)
    if (!block) return
    if (callFor(block, 'gain')) setControl(id, 'gain', value)
    else addControl(id, 'gain', value)
}

export const togglePanel = (id: string) => setOpenPanel(openPanel() === id ? null : id)


export function setWave(id: string, name: string) {
    const block = find(id)
    if (!block || stale()) return
    const call = block.calls.find((c) => (c.name === 's' || c.name === 'sound') && c.args[0]?.kind === 'string')
    const arg = call?.args[0]
    if (arg && arg.kind === 'string') engine.applyEdit(setString(arg, name))
    else engine.applyEdit(addCall(engine.getCode(), block, `.s("${name}")`))
    replay()
}

export function setFilterType(id: string, type: FilterType) {
    const block = find(id)
    const current = block ? filterTypeOf(block) : null
    if (!block || stale() || !current || current === type) return
    const edits = renameCalls(block.calls, (name) => {
        const def = findDef(name)
        const at = def ? FILTERS[current].indexOf(def.fn) : -1
        return at >= 0 ? FILTERS[type][at] : null
    })
    if (!edits.length) return
    engine.applyEdit(edits)
    replay()
}

export function setEcho(id: string, value: number | null) {
    const block = find(id)
    if (!block || stale()) return
    const call = callFor(block, 'delaysync')
    const arg = call?.args[0]
    if (value === null) {
        if (!call) return
        engine.applyEdit(removeCall(call))
    } else if (arg && (arg.kind === 'number' || arg.kind === 'slider')) {
        engine.applyEdit(setNumber(arg, String(value)))
    } else if (!call) {
        engine.applyEdit(addCall(engine.getCode(), block, `.delaysync(${value})`))
    } else {
        return
    }
    replay()
}

export function setTempo(bpm: number) {
    if (stale() || song().tempoLocked || !Number.isFinite(bpm)) return
    engine.applyEdit(tempoEdit(song(), Math.round(Math.min(300, Math.max(20, bpm)))))
    replay()
}

export function setMasterVolume(value: number) {
    const next = Math.round(Math.min(1.5, Math.max(0, value)) * 100) / 100
    setMasterVolumeValue(next)
    engine.setMasterVolume(next)
    localStorage.setItem(VOLUME_KEY, String(next))
}

export const waveformOf = () => engine.waveform()

function editableGrid(block: PatternBlock): GridSource | null {
    const direct = readGrid(block)
    if (direct) return direct
    const text = sourceText(block)
    if (!text || block.calls[1]?.name === 'slow') return null
    const cycles = engine.miniEvents(text.text, 4)
    const rows = cycles ? gridFromEvents(cycles) : null
    if (!rows) return null
    const steps = rows[0]?.steps.length ?? 16
    return { grid: { rows, steps, cycles: 1, perCycle: steps }, from: text.from, to: text.to, slow: null }
}

function changeGrid(id: string, change: (source: GridSource) => { rows: GridRow[]; cycles: number } | null) {
    const block = find(id)
    if (!block || stale()) return
    const source = editableGrid(block)
    const next = source ? change(source) : null
    setGridNotes({ ...gridNotes(), [id]: !source })
    if (!source || !next) return
    engine.applyEdit(gridEdits(block, source, next.rows, next.cycles))
    replay()
}

const pin = (id: string, sound: string) => {
    const current = pinnedRows()[id] ?? []
    if (!current.includes(sound)) setPinnedRows({ ...pinnedRows(), [id]: [...current, sound] })
}

export function toggleStep(id: string, sound: string, step: number) {
    pin(id, sound)
    let placed = false
    changeGrid(id, (source) => {
        placed = !source.grid.rows.find((row) => row.sound === sound)?.steps[step]
        return { rows: toggleGridStep(source.grid.rows, sound, step, source.grid.steps), cycles: source.grid.cycles }
    })
    if (placed && !engineState().playing) previewSound(id, sound)
}

export function addRow(id: string, sound: string) {
    pin(id, sound)
    previewSound(id, sound)
}

export function removeGridRow(id: string, sound: string) {
    setPinnedRows({ ...pinnedRows(), [id]: (pinnedRows()[id] ?? []).filter((other) => other !== sound) })
    const block = find(id)
    const source = block ? editableGrid(block) : null
    if (!source || !source.grid.rows.some((row) => row.sound === sound)) return
    changeGrid(id, (current) => ({ rows: removeRow(current.grid.rows, sound), cycles: current.grid.cycles }))
}

export function setLength(id: string, cycles: number) {
    changeGrid(id, (source) => (source.grid.cycles === cycles ? null : { rows: resize(source.grid, cycles), cycles }))
}

export function setStepsPerCycle(id: string, perCycle: number) {
    changeGrid(id, (source) => {
        const rows = resample(source.grid, perCycle)
        return rows && perCycle !== source.grid.perCycle ? { rows, cycles: source.grid.cycles } : null
    })
}

const bankOf = (id: string): string | null => {
    const block = find(id)
    return block?.calls.some((call) => call.name === 'bank') ? (block.soundName ?? null) : null
}

export function previewSound(id: string, sound: string) {
    engine.preview(sound, bankOf(id))
}

export function soundChoices(id: string, used: string[]) {
    return drumChoices(engine.soundNames(bankOf(id)), used)
}

const lastLength = new Map<string, number>()

function editableNotes(block: PatternBlock): NoteSource | null {
    const direct = readNotes(block)
    if (direct) return direct
    const text = noteText(block)
    if (!text || block.calls[1]?.name === 'slow') return null
    const cycles = engine.miniEvents(text.text, 8)
    const found = cycles ? notesFromEvents(cycles) : null
    if (!found) return null
    return { grid: { notes: found.notes, steps: found.perCycle * found.cycles, cycles: found.cycles, perCycle: found.perCycle }, from: text.from, to: text.to, slow: null }
}

function changeNotes(id: string, change: (source: NoteSource) => { notes: Note[]; perCycle: number; cycles: number } | null): boolean {
    const block = find(id)
    if (!block || stale()) return false
    const source = editableNotes(block)
    const next = source ? change(source) : null
    setGridNotes({ ...gridNotes(), [id]: !source })
    if (!source || !next) return false
    engine.applyEdit(noteEdits(block, source, next.notes, next.perCycle * next.cycles, next.cycles))
    replay()
    return true
}

const previewNoteOf = (id: string, midi: number) => {
    if (!engineState().playing) engine.previewNote(midi, find(id)?.soundName ?? null)
}

export function convertNotes(id: string) {
    const block = find(id)
    if (!block || readNotes(block)) return
    changeNotes(id, (source) => ({ notes: source.grid.notes, perCycle: source.grid.perCycle, cycles: source.grid.cycles }))
}

export function addNoteAt(id: string, at: { page: number; time: number; midi: number }): NoteRef | null {
    let added: NoteRef | null = null
    changeNotes(id, (source) => {
        const { notes, steps, perCycle, cycles } = source.grid
        const start = Math.min(steps - 1, (at.page % cycles) * perCycle + Math.floor(at.time * perCycle))
        const next = addNote(notes, { start, midi: at.midi, length: lastLength.get(id) ?? 1 }, steps)
        if (!next) return null
        added = { start, midi: at.midi }
        return { notes: next, perCycle, cycles }
    })
    if (added) previewNoteOf(id, at.midi)
    return added
}

export function removeNoteAt(id: string, ref: NoteRef) {
    changeNotes(id, (source) => ({ notes: removeNote(source.grid.notes, ref), perCycle: source.grid.perCycle, cycles: source.grid.cycles }))
}

export function moveNoteTo(id: string, ref: NoteRef, to: NoteRef): NoteRef | null {
    const moved = changeNotes(id, (source) => {
        const next = moveNote(source.grid.notes, ref, to, source.grid.steps)
        return next ? { notes: next, perCycle: source.grid.perCycle, cycles: source.grid.cycles } : null
    })
    if (moved && to.midi !== ref.midi) previewNoteOf(id, to.midi)
    return moved ? to : null
}

export function resizeNoteTo(id: string, ref: NoteRef, length: number): boolean {
    const resized = changeNotes(id, (source) => {
        const current = source.grid.notes.find((note) => note.start === ref.start && note.midi === ref.midi)
        if (!current || current.length === length) return null
        const next = resizeNote(source.grid.notes, ref, length, source.grid.steps)
        return next ? { notes: next, perCycle: source.grid.perCycle, cycles: source.grid.cycles } : null
    })
    if (resized) lastLength.set(id, length)
    return resized
}

export function setNotesLength(id: string, cycles: number) {
    changeNotes(id, (source) => (source.grid.cycles === cycles ? null : { notes: resizeNotes(source.grid, cycles), perCycle: source.grid.perCycle, cycles }))
}

export function setNotesSteps(id: string, perCycle: number) {
    changeNotes(id, (source) => {
        const notes = resampleNotes(source.grid, perCycle)
        return notes && perCycle !== source.grid.perCycle ? { notes, perCycle, cycles: source.grid.cycles } : null
    })
}

export function addPattern(kind: StarterKind): string | null {
    const starter = PATTERN_STARTERS.find((entry) => entry.kind === kind)
    if (!starter || stale()) return null
    const name = freeName(
        starter.name,
        song().patterns.map((p) => p.id),
    )
    engine.applyEdit(appendPattern(engine.getCode(), starterCode(kind, name)))
    replay()
    select(name)
    return name
}

export function openSounds(id?: string) {
    if (id) select(id)
    setSoundsOpen(true)
}

export const closeSounds = () => setSoundsOpen(false)
export const toggleSounds = () => setSoundsOpen(!soundsOpen())

export const soundCatalogue = (): SoundItem[] => catalogue(engine.sounds(), engine.kitNames())

const PREVIEW_PITCH = 60

export function hearSound(item: SoundItem, part?: string) {
    if (item.group === 'kits') {
        const sound = part ?? item.parts[0]?.sound
        if (sound) engine.preview(sound, item.name)
        return
    }
    if (item.group === 'samples') {
        engine.preview(item.name, null)
        return
    }
    const id = selected()
    const pitch = id ? eventsOf(id, 0).find((event) => event.midi !== null)?.midi : null
    engine.previewNote(pitch ?? PREVIEW_PITCH, item.name, 0.6)
}

export function useSound(id: string, item: SoundItem) {
    const block = find(id)
    if (!block || stale() || !fits(block, item.group)) return
    engine.applyEdit(soundEdit(engine.getCode(), block, item))
    replay()
}
