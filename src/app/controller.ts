import { batch, createEffect, createRoot } from 'solid-js'
import { FILTERS, filterTypeOf, findDef, writeNumber, type FilterType } from '../controls/catalog'
import { drumChoices } from '../controls/drums'
import { callFor, controlOf, valueArg, type ControlView } from '../controls/views'
import { installViewMenu } from '../desktop/menu'
import { saveFile, type FileKind, type Saved } from '../desktop/save'
import { createEngine } from '../engine/engine'
import { DEMOS } from '../library/demos'
import { cleanName, createShelf, freeTitle, infoOf, NEW_SONG, newId, UNTITLED, type SongRecord } from '../library/shelf'
import { CODE_LEAST, DEFAULT_LAYOUT, fitWidth, isUsual, MIDDLE_LEAST, readLayout, SOUNDS_LEAST, SOUNDS_WIDTH, usualCode, type Layout, type ViewMode } from '../library/layout'
import { readSongFile, renameSound, SONG_FILE, soundsUsed, writeSongFile } from '../library/songfile'
import { ownSoundStore, soundNameFor, type OwnSound } from '../library/sounds'
import { readKey, writeKey, type Key } from '../song/scales'
import { gradeOf, readAudio, RING_SECONDS, type AudioOptions, type Format } from '../library/audio'
import { encodeMp3 } from '../library/mp3'
import { encodeWav, fileName, levelFor, peakOf, soundingLength } from '../library/wav'
import { analyze } from '../song/analyze'
import { arrangeSong, barsOf, readArrangement, repeatEdits, songLength } from '../song/arrange'
import { addCall, removeCall, renameCalls, setNumber, setString, setTempo as tempoEdit, toggleMute as muteEdit } from '../song/edits'
import {
    gridFromEvents,
    lengthEdits,
    readGrid,
    removeRow,
    resample,
    resize,
    sourceText,
    toggleAccent as toggleGridAccent,
    toggleStep as toggleGridStep,
    type Grid,
    type GridRow,
    type GridSource,
} from '../song/grid'
import { convertEdits, kitEdits, MUTE, readKit, rowTarget } from '../song/kit'
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
import {
    appendPattern,
    duplicateEdit,
    freeName,
    PATTERN_STARTERS,
    patternNameFrom,
    removePattern as removeEdit,
    renameEdit,
    soundStarter,
    starterCode,
    swapEdits,
    type StarterKind,
} from '../song/patterns'
import { STARTER } from '../song/starter'
import type { PatternBlock, PatternEvent } from '../song/types'
import { fits, isRow, soundEdit, soundTextAt } from '../sounds/apply'
import { catalogue, type SoundItem } from '../sounds/catalog'
import {
    cycle,
    deletedSong,
    engineState,
    exporting,
    gridNotes,
    openDemoId,
    openPanel,
    ownSounds,
    removed,
    rollRanges,
    selected,
    setBeat,
    setBpm,
    setCurrentSong,
    setCycle,
    setDeletedSong,
    setEngineState,
    setExportNote,
    setExportOpen,
    setExporting,
    setGridNotes,
    setMasterVolumeValue,
    setSongShown,
    setWaveShown,
    songShown,
    waveShown,
    codeWidth,
    setCodeWidth,
    setSoundsWidth,
    setViewMode,
    soundsWidth,
    viewMode,
    setOpenDemoId,
    setOpenPanel,
    setOwnSoundNote,
    setOwnSounds,
    setPosition,
    setRemoved,
    setRevision,
    setRollRanges,
    setSelected,
    setSoloIds,
    setSong,
    setLoopBars,
    loopBars,
    setSongBars,
    setSongKey,
    setSongNote,
    setSongs,
    setSoundsOpen,
    setStartBar,
    setUnfolded,
    setStale,
    soloIds,
    song,
    songBars,
    soundsOpen,
    stale,
    startBar,
    unfolded,
} from '../stores/song'

// Where the one song was kept before there could be several. It is read once, to become the
// first song of the shelf.
const FIRST_SONG_KEY = 'weft.song'
const DEMO = 'demo:'
const STARTER_NAME = 'Night bus'
const VOLUME_KEY = 'weft.volume'
const LAYOUT_KEY = 'weft.layout'
const COLORS = ['var(--madder)', 'var(--saffron)', 'var(--woad)', 'var(--lichen)', 'var(--orchil)']

const engine = createEngine()
let saveTimer: number | undefined
let frame = 0

export const colorAt = (index: number) => COLORS[index % COLORS.length]

// A target is a pattern, or one sound of a drum kit written as "pattern/sound".
const ownerOf = (target: string) => target.split('/')[0]

function resolve(patterns: PatternBlock[], target: string): PatternBlock | undefined {
    const owner = ownerOf(target)
    const block = patterns.find((p) => p.id === owner)
    if (!block || owner === target) return block
    return readKit(block)?.rows.find((row) => row.sound === target.slice(owner.length + 1))?.block
}

const find = (target: string) => resolve(song().patterns, target)

// ---- songs. Every song has the version that was saved and the version being worked on. The
// second is written half a second after each change, so closing the app loses nothing.
const shelf = createShelf(localStorage)
let current: SongRecord | null = null

function refreshSongs() {
    batch(() => {
        setSongs(shelf.list())
        setCurrentSong(current ? infoOf(current) : null)
    })
}

// A demo that is open and as it came is not one of your songs: it is kept in the app only, and
// becomes a song of your own with the first change, a new name or a save.
function flush() {
    window.clearTimeout(saveTimer)
    if (current && openDemoId() === null) shelf.write(current)
}

function keepAsOwn() {
    if (!current || openDemoId() === null) return
    setOpenDemoId(null)
    shelf.write(current)
    shelf.setCurrent(current.id)
    refreshSongs()
}

function keepDraft(code: string) {
    if (!current || code === current.draft) return
    current = { ...current, draft: code, changedAt: Date.now() }
    keepAsOwn()
    setCurrentSong(infoOf(current))
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(flush, 500)
}

const titles = () => shelf.list().map((entry) => entry.name)

function demoSong(id: string): SongRecord | null {
    const demo = DEMOS.find((entry) => entry.id === id)
    return demo ? { id: newId(), name: freeTitle(demo.name, titles()), saved: demo.code, draft: demo.code, changedAt: Date.now() } : null
}

function firstSong(): SongRecord {
    const open = shelf.current()
    const demo = open?.startsWith(DEMO) ? demoSong(open.slice(DEMO.length)) : null
    if (demo) {
        setOpenDemoId(open!.slice(DEMO.length))
        return demo
    }
    const found = (open ? shelf.read(open) : null) ?? shelf.list().flatMap((entry) => shelf.read(entry.id) ?? [])[0]
    if (found) return found
    const before = localStorage.getItem(FIRST_SONG_KEY)
    const code = before ?? STARTER
    const record: SongRecord = { id: newId(), name: before === null ? STARTER_NAME : UNTITLED, saved: code, draft: code, changedAt: Date.now() }
    shelf.write(record)
    shelf.setCurrent(record.id)
    return record
}

function onCode(code: string) {
    if (removed() && code !== removed()?.after) setRemoved(null)
    const next = analyze(code)
    if (next.error) {
        setStale(true)
    } else {
        const ids = new Set(next.patterns.map((p) => p.id))
        const kept = soloIds().filter((id) => ids.has(id))
        const open = openPanel()
        batch(() => {
            setSong(next)
            setStale(false)
            if (kept.length !== soloIds().length) setSoloIds(kept)
            if (open !== null && !resolve(next.patterns, open)) closePanel()
        })
        if (kept.length !== soloIds().length) engine.setSolo(kept)
    }
    keepDraft(code)
}

// A song that has been arranged ends with its last bar and stops there. One with nothing
// arranged is a loop that is still being worked on, and goes round until it is stopped.
const songEnd = (): number | null => (song().patterns.some((block) => readArrangement(block)) ? songLength(song().patterns, songBars()) : null)

function tick() {
    const now = engine.now()
    const end = songEnd()
    if (end !== null && now >= end) return engine.stop()
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
    current = firstSong()
    setSongKey(readKey(current.key))
    refreshSongs()
    const initial = current.draft
    window.addEventListener('pagehide', flush)
    engine.onState((next) => {
        const before = engineState()
        setEngineState(next)
        if (next.sounds !== 'loading' && before.sounds === 'loading') void loadOwnSounds()
        if (next.playing && !before.playing) {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(tick)
        }
        if (!next.playing && before.playing) cancelAnimationFrame(frame)
        // A paused song keeps showing where it is. A stopped one goes back to where it starts.
        if (!next.playing && !next.paused && (before.playing || before.paused)) {
            batch(() => {
                setCycle(startBar())
                setPosition(0)
                setBeat(0)
            })
        }
    })
    engine.onCodeChange(onCode)
    engine.onSoundDrop(dropSound)
    engine.onCursor((offset) => {
        if (stale()) return
        const hit = song().patterns.find((p) => offset >= p.from && offset <= p.to)
        if (hit) markSelected(hit.id)
    })
    engine.onEvaluated(() =>
        batch(() => {
            setRevision((r) => r + 1)
            setBpm(engine.bpm())
        }),
    )
    onCode(initial)
    await engine.mount(root, initial)
    const tickMenu = await installViewMenu([
        { id: 'weft-view-both', text: 'Controls and Code', checked: () => viewMode() === 'both', action: () => setView('both') },
        { id: 'weft-view-controls', text: 'Controls Only', checked: () => viewMode() === 'controls', action: () => setView('controls') },
        { id: 'weft-view-code', text: 'Code Only', checked: () => viewMode() === 'code', action: () => setView('code') },
        'line',
        { id: 'weft-view-sounds', text: 'Sounds', checked: soundsOpen, action: toggleSounds },
        { id: 'weft-view-wave', text: 'Waveform', checked: waveShown, action: toggleWaveform },
        { id: 'weft-view-song', text: 'Song Panel', checked: songShown, action: toggleSongPanel },
        'line',
        { id: 'weft-view-reset', text: 'Reset Layout', action: resetLayout },
    ])
    createRoot(() => {
        createEffect(() => {
            layoutNow()
            tickMenu()
        })
        createEffect(() => engine.setEnd(songEnd()))
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

// One step back, or forward again, in everything that changed the song: a click in a grid, a
// knob, a sound, or typing in the code.
export function undoChange() {
    if (engine.undo()) replay()
}

export function redoChange() {
    if (engine.redo()) replay()
}

// The code is evaluated in a turn of its own, after the screen has followed the change. Both
// are work on the thread that Strudel keeps time on, and two short stretches are not heard
// where one long one is. Changes made in the same turn are evaluated once.
let replayTimer = 0
function replay() {
    window.clearTimeout(replayTimer)
    replayTimer = window.setTimeout(() => {
        if (engineState().playing) play()
        else void engine.refresh()
    }, 0)
}

export const stop = () => engine.stop()

export const pause = () => engine.pause()

export const togglePlay = () => (engineState().playing ? pause() : play())

// While a sound panel is open the other strips are folded. One that is chosen opens and stays
// open until the panel changes, so choosing or adding another never folds it again.
function markSelected(id: string) {
    batch(() => {
        setSelected(id)
        if (openPanel() !== null && !unfolded().includes(id)) setUnfolded([...unfolded(), id])
    })
}

const closePanel = () =>
    batch(() => {
        setOpenPanel(null)
        setUnfolded([])
    })

export function select(id: string) {
    const block = find(id)
    if (!block) return
    markSelected(id)
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

export const inStep = (): boolean => engine.inStep()

// A strip draws its pattern in every bar, also in the bars where the song lets it rest.
export const eventsOf = (id: string, whichCycle: number): PatternEvent[] => engine.events(id, whichCycle, true)

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
    const arg = valueArg(callFor(block, fn))
    if (!arg) return
    const def = findDef(fn)
    const min = arg.kind === 'slider' ? arg.min : Math.min(def?.min ?? 0, value)
    const max = arg.kind === 'slider' ? arg.max : Math.max(def?.max ?? 1, value)
    const text = writeNumber(Math.min(max, Math.max(min, value)), min, max)
    if (arg.kind === 'slider' && engine.moveSlider(arg.valueFrom, text)) return
    engine.applyEdit(setNumber(arg, text))
    scheduleEvaluate()
}

export function addControl(id: string, fn: string, value?: number) {
    const block = forEdit(id)
    const def = findDef(fn)
    if (!block || !def || stale() || callFor(block, fn)) return
    const start = writeNumber(value ?? def.initial, def.min, def.max)
    const [before, after] = def.wrap ?? ['', '']
    engine.applyEdit(addCall(engine.getCode(), block, `.${def.fn}(${before}slider(${start}, ${def.min}, ${def.max})${after})`))
    replay()
}

export function removeControl(id: string, fn: string) {
    const block = find(id)
    const call = block ? callFor(block, fn) : undefined
    if (!call || stale()) return
    engine.applyEdit(removeCall(call))
    replay()
}

export function setMix(id: string, fn: 'gain' | 'pan', value: number) {
    const block = find(id)
    if (block && callFor(block, fn)) setControl(id, fn, value)
    else addControl(id, fn, value)
}

export function togglePanel(target: string) {
    if (openPanel() === target) return closePanel()
    if (!forEdit(target)) return
    batch(() => {
        setOpenPanel(target)
        setUnfolded([])
    })
    select(ownerOf(target))
}


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

// Pump: the patterns that are switched to it drop every time the kick hits and come back up, the
// way a compressor keyed by the kick makes them breathe. Strudel does it between two of its
// mixing channels: the pumped patterns are put on a channel of their own, and the kick is told
// to duck that channel. The kick is the first drum row called bd.
const PUMP_CHANNEL = 2
const DUCKING = ['duckorbit', 'duckattack', 'duckdepth', 'duckonset']

const kickRow = (): PatternBlock | undefined => song().patterns.flatMap((block) => readKit(block)?.rows ?? []).find((row) => row.sound === 'bd')?.block

export const isPumped = (block: PatternBlock): boolean => block.calls.some((call) => call.name === 'orbit' && call.args[0]?.kind === 'number' && call.args[0].value === PUMP_CHANNEL)

// Whether a pattern can be pumped, and when it cannot, why not.
export function pumpFor(id: string): { can: boolean; why: string } {
    const kick = kickRow()
    if (!kick) return { can: false, why: 'Pump needs a kick to follow: a drum row called bd' }
    if (ownerOf(kick.id) === id) return { can: false, why: 'The kick is in this pattern, and it cannot pump itself' }
    return { can: true, why: 'Drops this pattern every time the kick hits' }
}

export function setPump(id: string, on: boolean) {
    const block = find(id)
    const kick = kickRow()
    if (!block || stale() || isPumped(block) === on) return
    const code = engine.getCode()
    if (on) {
        if (!kick || !pumpFor(id).can) return
        const edits = [addCall(code, block, `.orbit(${PUMP_CHANNEL})`)]
        if (!kick.calls.some((call) => call.name === 'duckorbit')) edits.push(addCall(code, kick, `.duckorbit(${PUMP_CHANNEL}).duckattack(0.2).duckdepth(slider(0.8, 0, 1))`))
        engine.applyEdit(edits)
    } else {
        const orbit = block.calls.find((call) => call.name === 'orbit')
        const others = song().patterns.some((other) => other.id !== id && isPumped(other))
        const ducks = others || !kick ? [] : kick.calls.filter((call) => DUCKING.includes(call.name))
        engine.applyEdit([...(orbit ? [removeCall(orbit)] : []), ...ducks.map(removeCall)])
    }
    replay()
}

// How far the pumped patterns drop. It is the kick's setting, shown with every pumped pattern.
export function pumpDepth(): ControlView | null {
    const kick = kickRow()
    return kick?.calls.some((call) => call.name === 'duckdepth') ? { ...controlOf(kick, 'duckdepth'), label: 'Pump' } : null
}

export function setPumpDepth(value: number) {
    const kick = kickRow()
    if (kick) setControl(kick.id, 'duckdepth', value)
}

// Sounds that share a number here cut each other off: a new hit stops the one before it. Each
// pattern or row that is switched to play one at a time gets a number no other has, so that it
// only ever cuts itself.
const CUT = 'cut'

function cutsInUse(): number[] {
    const blocks = song().patterns.flatMap((block) => [block, ...(readKit(block)?.rows.map((row) => row.block) ?? [])])
    return blocks.flatMap((block) => block.calls.flatMap((call) => (call.name === CUT && call.args[0]?.kind === 'number' ? [call.args[0].value] : [])))
}

export const cutsItself = (block: PatternBlock): boolean => block.calls.some((call) => call.name === CUT)

export function setCut(id: string, on: boolean) {
    const block = on ? forEdit(id) : find(id)
    if (!block || stale()) return
    const call = block.calls.find((entry) => entry.name === CUT)
    if (on === Boolean(call)) return
    if (call) {
        engine.applyEdit(removeCall(call))
    } else {
        const used = cutsInUse()
        let group = 1
        while (used.includes(group)) group++
        engine.applyEdit(addCall(engine.getCode(), block, `.${CUT}(${group})`))
    }
    replay()
}

export function setEcho(id: string, value: number | null) {
    const block = value === null ? find(id) : forEdit(id)
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

const layoutNow = (): Layout => ({ view: viewMode(), sounds: soundsOpen(), wave: waveShown(), song: songShown(), soundsWidth: soundsWidth(), codeWidth: codeWidth() })

function applyLayout(layout: Layout) {
    batch(() => {
        setViewMode(layout.view)
        setSoundsOpen(layout.sounds)
        setWaveShown(layout.wave)
        setSongShown(layout.song)
        setSoundsWidth(layout.soundsWidth)
        setCodeWidth(layout.codeWidth)
    })
}

const keepLayout = () => localStorage.setItem(LAYOUT_KEY, JSON.stringify(layoutNow()))

applyLayout(readLayout(localStorage.getItem(LAYOUT_KEY)))

export const layoutIsUsual = (): boolean => isUsual(layoutNow())

export function resetLayout() {
    applyLayout(DEFAULT_LAYOUT)
    keepLayout()
}

export function setView(view: ViewMode) {
    setViewMode(view)
    keepLayout()
}

export function toggleWaveform() {
    setWaveShown(!waveShown())
    keepLayout()
}

export function toggleSongPanel() {
    setSongShown(!songShown())
    keepLayout()
}

// The room the other columns need, so that a column cannot be dragged over them.
const beside = (column: 'sounds' | 'code') => {
    const middle = viewMode() === 'code' ? 0 : MIDDLE_LEAST
    if (column === 'sounds') return middle + (viewMode() === 'controls' ? 0 : viewMode() === 'code' ? CODE_LEAST : (codeWidth() ?? usualCode(window.innerWidth)))
    return middle + (soundsOpen() ? (soundsWidth() ?? SOUNDS_WIDTH) : 0)
}

// While a divider is dragged the width follows the pointer; it is kept when it is let go.
export function dragSounds(wanted: number, done: boolean) {
    setSoundsWidth(fitWidth(wanted, SOUNDS_LEAST, window.innerWidth, beside('sounds')))
    if (done) keepLayout()
}

export function dragCode(wanted: number, done: boolean) {
    setCodeWidth(fitWidth(wanted, CODE_LEAST, window.innerWidth, beside('code')))
    if (done) keepLayout()
}

export function usualWidth(column: 'sounds' | 'code') {
    if (column === 'sounds') setSoundsWidth(null)
    else setCodeWidth(null)
    keepLayout()
}

// The whole song is selected in the editor as well, so it is plain what was copied, and so the
// older way of copying has something to copy where the newer one is not allowed.
export async function copyCode(): Promise<boolean> {
    engine.selectAll()
    try {
        await navigator.clipboard.writeText(engine.getCode())
        return true
    } catch {
        return document.execCommand('copy')
    }
}

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

function changeDrums(id: string, change: (drums: Grid) => { rows: GridRow[]; cycles: number } | null): boolean {
    const block = find(id)
    if (!block || stale()) return false
    const kit = readKit(block)
    const legacy = kit ? null : editableGrid(block)
    const drums: Grid | null = kit ? { ...kit, rows: kit.rows.map(({ sound, steps, accents }) => ({ sound, steps, ...(accents ? { accents } : {}) })) } : (legacy?.grid ?? null)
    const next = drums ? change(drums) : null
    setGridNotes({ ...gridNotes(), [id]: !drums })
    if (!drums || !next) return false
    const edits = kit
        ? [...kitEdits(engine.getCode(), kit, next.rows), ...lengthEdits(block, kit.slow, next.cycles)]
        : convertEdits(block, legacy?.slow ?? null, next.rows, next.cycles)
    if (!edits.length) return true
    engine.applyEdit(edits)
    replay()
    return true
}

// One sound of a kit can have controls of its own only when the kit is written with a line for
// each sound, so a kit written the older way is rewritten before the first one is added.
function forEdit(target: string): PatternBlock | undefined {
    const found = find(target)
    if (found || ownerOf(target) === target) return found
    changeDrums(ownerOf(target), (drums) => ({ rows: drums.rows, cycles: drums.cycles }))
    return find(target)
}

export function toggleStep(id: string, sound: string, step: number) {
    let placed = false
    changeDrums(id, (drums) => {
        placed = !drums.rows.find((row) => row.sound === sound)?.steps[step]
        return { rows: toggleGridStep(drums.rows, sound, step, drums.steps), cycles: drums.cycles }
    })
    if (placed && !engineState().playing) previewSound(id, sound)
}

// A louder hit on this step, or an ordinary one again.
export function toggleAccent(id: string, sound: string, step: number) {
    changeDrums(id, (drums) => ({ rows: toggleGridAccent(drums.rows, sound, step, drums.steps), cycles: drums.cycles }))
    if (!engineState().playing) previewSound(id, sound)
}

export function addRow(id: string, sound: string) {
    changeDrums(id, (drums) =>
        drums.rows.some((row) => row.sound === sound) ? null : { rows: [...drums.rows, { sound, steps: Array<boolean>(drums.steps).fill(false) }], cycles: drums.cycles },
    )
    previewSound(id, sound)
}

export function toggleRowMute(id: string, sound: string) {
    if (stale()) return
    const block = forEdit(rowTarget(id, sound))
    if (!block) return
    const hush = block.calls.find((call) => call.name === MUTE)
    engine.applyEdit(hush ? removeCall(hush) : addCall(engine.getCode(), block, `.${MUTE}()`))
    replay()
}

export function removeGridRow(id: string, sound: string) {
    changeDrums(id, (drums) => (drums.rows.some((row) => row.sound === sound) ? { rows: removeRow(drums.rows, sound), cycles: drums.cycles } : null))
}

export function setLength(id: string, cycles: number) {
    changeDrums(id, (drums) => (drums.cycles === cycles ? null : { rows: resize(drums, cycles), cycles }))
}

export function setStepsPerCycle(id: string, perCycle: number) {
    changeDrums(id, (drums) => {
        const rows = resample(drums, perCycle)
        return rows && perCycle !== drums.perCycle ? { rows, cycles: drums.cycles } : null
    })
}

const bankOf = (id: string): string | null => {
    const block = find(id)
    return block?.calls.some((call) => call.name === 'bank') ? (block.soundName ?? null) : null
}

export function previewSound(id: string, sound: string) {
    engine.preview(sound, bankOf(id), ownSounds().some((own) => own.name === sound) ? OWN_PREVIEW_SECONDS : undefined)
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

// One note, or several that start together, as a chord does. A note that has no room where it
// would go is left out; the rest still go in.
export function addNotesAt(id: string, at: { page: number; time: number; midis: number[] }): NoteRef | null {
    let added: NoteRef | null = null
    const placed: number[] = []
    changeNotes(id, (source) => {
        const { steps, perCycle, cycles } = source.grid
        const start = Math.min(steps - 1, (at.page % cycles) * perCycle + Math.floor(at.time * perCycle))
        let notes = source.grid.notes
        for (const midi of at.midis) {
            const next = addNote(notes, { start, midi, length: lastLength.get(id) ?? 1 }, steps)
            if (!next) continue
            notes = next
            placed.push(midi)
            added ??= { start, midi }
        }
        return placed.length ? { notes, perCycle, cycles } : null
    })
    for (const midi of placed) previewNoteOf(id, midi)
    return added
}

export const addNoteAt = (id: string, at: { page: number; time: number; midi: number }): NoteRef | null => addNotesAt(id, { page: at.page, time: at.time, midis: [at.midi] })

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

function addStarter(base: string, code: (name: string) => string, range?: { low: number; high: number }): string | null {
    if (stale()) return null
    const name = freeName(
        base,
        song().patterns.map((p) => p.id),
    )
    // What the empty strip shows first is set before the code changes, because the strip is
    // drawn the moment its code exists.
    batch(() => {
        setRollRanges({ ...without(rollRanges(), name), ...(range ? { [name]: range } : {}) })
        setGridNotes(without(gridNotes(), name))
    })
    lastLength.delete(name)
    engine.applyEdit(appendPattern(engine.getCode(), code(name)))
    replay()
    select(name)
    return name
}

export function addPattern(kind: StarterKind): string | null {
    const starter = PATTERN_STARTERS.find((entry) => entry.kind === kind)
    return starter ? addStarter(starter.name, (name) => starterCode(kind, name), starter.range) : null
}

// A sound dragged from the browser and let go where there is no pattern starts one with it.
export function addPatternWith(item: SoundItem): string | null {
    const starter = soundStarter(item.name, item.group === 'kits' ? 'kit' : item.group === 'samples' || item.group === 'yours' ? 'sample' : 'notes')
    return addStarter(starter.name, starter.code, starter.range)
}

// Let go on a pattern it becomes that pattern's sound, as Use does, when it is a sound the
// pattern can take.
export function dropOnPattern(id: string, item: SoundItem): boolean {
    const block = find(id)
    if (!block || stale() || !fits(block, item.group)) return false
    select(id)
    useSound(id, item)
    return true
}

// What the app remembers about a pattern by its name goes with the pattern to its new name.
function carry<T>(record: Record<string, T>, from: string, to: string): Record<string, T> {
    if (!(from in record)) return record
    const { [from]: value, ...rest } = record
    return { ...rest, [to]: value }
}

// False when the name cannot be one, or another pattern has it.
export function renamePattern(id: string, text: string): boolean {
    const block = find(id)
    const name = patternNameFrom(text)
    if (!block || stale() || !name) return false
    if (name === id) return true
    if (song().patterns.some((other) => other.id === name)) return false
    const panel = openPanel()
    batch(() => {
        setRollRanges(carry(rollRanges(), id, name))
        setGridNotes(carry(gridNotes(), id, name))
        if (selected() === id) setSelected(name)
        if (soloIds().includes(id)) setSoloIds(soloIds().map((solo) => (solo === id ? name : solo)))
        if (panel === id || panel?.startsWith(`${id}/`)) setOpenPanel(name + panel.slice(id.length))
    })
    if (lastLength.has(id)) lastLength.set(name, lastLength.get(id) as number)
    lastLength.delete(id)
    engine.applyEdit(renameEdit(block, name))
    engine.setSolo(soloIds())
    replay()
    return true
}

export function duplicatePattern(id: string): string | null {
    const block = find(id)
    if (!block || stale()) return null
    const name = freeName(
        id.replace(/\d+$/, '') || id,
        song().patterns.map((p) => p.id),
    )
    if (rollRanges()[id]) setRollRanges({ ...rollRanges(), [name]: rollRanges()[id] })
    engine.applyEdit(duplicateEdit(engine.getCode(), block, name))
    replay()
    select(name)
    return name
}

// One place up, towards the top, or one place down.
export function movePattern(id: string, by: -1 | 1) {
    const patterns = song().patterns
    const at = patterns.findIndex((p) => p.id === id)
    const other = patterns[at + by]
    if (at < 0 || !other || stale()) return
    const [first, second] = by < 0 ? [other, patterns[at]] : [patterns[at], other]
    engine.applyEdit(swapEdits(engine.getCode(), first, second))
    replay()
}

export function openSounds(id?: string) {
    if (id) select(id)
    setSoundsOpen(true)
    keepLayout()
}

export function closeSounds() {
    setSoundsOpen(false)
    keepLayout()
}

export const toggleSounds = () => (soundsOpen() ? closeSounds() : openSounds())

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
    if (item.group === 'yours') {
        engine.preview(item.name, null, OWN_PREVIEW_SECONDS)
        return
    }
    const id = selected()
    const pitch = id ? eventsOf(id, 0).find((event) => event.midi !== null)?.midi : null
    engine.previewNote(pitch ?? PREVIEW_PITCH, item.name, 0.6)
}

export function useSound(id: string, item: SoundItem) {
    const block = find(id)
    if (!block || stale() || !fits(block, item.group)) return
    if (isRow(block, item)) return addRow(id, item.name)
    engine.applyEdit(soundEdit(engine.getCode(), block, item))
    replay()
}

// A sound let go over the code. Between the quotes of s("...") or bank("...") it takes the
// place of the name that is there. Anywhere else on a pattern it becomes that pattern's sound,
// as Use does. Where neither can be, its name is put in as text.
function dropSound(offset: number, name: string) {
    if (stale()) return engine.applyEdit({ from: offset, to: offset, insert: name })
    const item = soundCatalogue().find((entry) => entry.name === name)
    if (!item) return
    const text = soundTextAt(song().patterns, offset)
    const block = song().patterns.find((pattern) => offset >= pattern.from && offset <= pattern.to)
    if (text) engine.applyEdit(setString(text, item.name))
    else if (block && fits(block, item.group)) return useSound(block.id, item)
    else engine.applyEdit({ from: offset, to: offset, insert: item.name })
    replay()
}

const OWN_PREVIEW_SECONDS = 4
const ownUrls = new Map<string, string>()
const infoOfSound = ({ name, file, seconds }: OwnSound) => ({ name, file, seconds })
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

async function register(sound: OwnSound) {
    const url = URL.createObjectURL(new Blob([sound.data], { type: sound.type }))
    ownUrls.set(sound.name, url)
    await engine.addSound(sound.name, url)
}

// The drum kits have to be known first: a sound of your own is made known in every one of them.
async function loadOwnSounds() {
    try {
        const kept = await ownSoundStore.all()
        for (const sound of kept) await register(sound)
        setOwnSounds(kept.map(infoOfSound).sort(byName))
        if (kept.length) replay()
    } catch {
        setOwnSoundNote('Your own sounds could not be read from where the app keeps them.')
    }
}

export async function addOwnSounds(files: File[]) {
    const refused: string[] = []
    for (const file of files) {
        try {
            const data = await file.arrayBuffer()
            const seconds = await engine.audioLength(data.slice(0))
            if (seconds === null) {
                refused.push(file.name)
                continue
            }
            const sound: OwnSound = { name: soundNameFor(file.name, engine.soundTaken), file: file.name, seconds, addedAt: Date.now(), type: file.type, data }
            await ownSoundStore.put(sound)
            await register(sound)
            setOwnSounds([...ownSounds(), infoOfSound(sound)].sort(byName))
        } catch {
            refused.push(file.name)
        }
    }
    setOwnSoundNote(refused.length ? `${refused.join(', ')} could not be read as sound, so ${refused.length === 1 ? 'it was' : 'they were'} not added.` : null)
}

// A song that still uses the sound keeps the name in its code and is silent there.
export async function removeOwnSound(name: string) {
    await ownSoundStore.remove(name).catch(() => undefined)
    engine.removeSound(name)
    const url = ownUrls.get(name)
    if (url) URL.revokeObjectURL(url)
    ownUrls.delete(name)
    setOwnSounds(ownSounds().filter((sound) => sound.name !== name))
    replay()
}

function without<T>(record: Record<string, T>, id: string): Record<string, T> {
    const { [id]: _, ...rest } = record
    return rest
}

export function removePattern(id: string) {
    const block = find(id)
    if (!block || stale()) return
    const code = engine.getCode()
    const edit = removeEdit(code, block)
    const index = [...new Set(song().patterns.map((p) => p.id))].indexOf(id)
    engine.applyEdit(edit)
    lastLength.delete(id)
    batch(() => {
        setRollRanges(without(rollRanges(), id))
        setGridNotes(without(gridNotes(), id))
        setRemoved({ id, index, from: edit.from, text: code.slice(edit.from, edit.to), after: engine.getCode() })
    })
    replay()
}

export function restorePattern() {
    const gone = removed()
    if (!gone || stale() || engine.getCode() !== gone.after) return
    engine.applyEdit({ from: gone.from, to: gone.from, insert: gone.text })
    replay()
    select(gone.id)
}

export const songLengthNow = (): number => songLength(song().patterns, songBars())

// What a pattern plays depends on its own text and on the code that belongs to no pattern, and
// not on the bars it is given. This is that text, so a picture of the pattern is only drawn
// again when it could have changed.
export function patternText(id: string): string {
    const block = find(id)
    if (!block) return ''
    const code = engine.getCode()
    const bars = readArrangement(block)
    const own = bars ? code.slice(block.from, bars.call.from) + code.slice(bars.call.to, block.to) : code.slice(block.from, block.to)
    let outside = ''
    let at = 0
    for (const other of song().patterns) {
        outside += code.slice(at, other.from)
        at = other.to
    }
    return `${own}\u0000${outside}${code.slice(at)}`
}

const lanes = (): PatternBlock[] => {
    const seen = new Set<string>()
    return song().patterns.filter((block) => !seen.has(block.id) && Boolean(seen.add(block.id)))
}

export function setBars(id: string, bars: boolean[]) {
    if (!find(id) || stale()) return
    const { edits, length } = arrangeSong(engine.getCode(), lanes(), id, bars, songLengthNow())
    setSongBars(length)
    if (startBar() >= length) startFrom(0)
    if (!edits.length) return
    engine.applyEdit(edits)
    replay()
}

export function toggleBar(id: string, bar: number) {
    const block = find(id)
    if (!block) return
    const bars = barsOf(block, Math.max(songLengthNow(), bar + 1)).map((on, at) => (at < songLengthNow() ? on : false))
    setBars(
        id,
        bars.map((on, at) => (at === bar ? !on : on)),
    )
}

export function startFrom(bar: number) {
    if (loopBars()) clearLoop()
    setStartBar(bar)
    engine.setStart(bar)
    if (!engineState().playing) setCycle(bar)
}

// Bars that go round, to work on one part of the song while hearing it. Both ends are part of
// what goes round.
export function loopBetween(first: number, last: number) {
    const length = songLengthNow()
    const from = Math.max(0, Math.min(first, last, length - 1))
    const to = Math.min(length, Math.max(first, last) + 1)
    if (to <= from) return
    setLoopBars({ from, to })
    engine.setLoop({ from, to })
    if (!engineState().playing) setCycle(from)
}

export function clearLoop() {
    if (!loopBars()) return
    setLoopBars(null)
    engine.setLoop(null)
    if (!engineState().playing) setCycle(startBar())
}

// The bars that go round once more, straight after themselves, in every pattern.
export function repeatLoop() {
    const range = loopBars()
    if (!range || stale()) return
    const { edits, length } = repeatEdits(engine.getCode(), lanes(), range.from, range.to, songLengthNow())
    setSongBars(length)
    if (edits.length) engine.applyEdit(edits)
    const moved = { from: range.to, to: Math.min(length, range.to + (range.to - range.from)) }
    setLoopBars(moved)
    engine.setLoop(moved)
    if (!engineState().playing) setCycle(moved.from)
    replay()
}

export const restsNow = (id: string): boolean => {
    const block = find(id)
    const written = block ? readArrangement(block)?.bars : undefined
    return Boolean(written && engineState().playing && !written[cycle() % written.length])
}

function show(record: SongRecord, demo: string | null = null) {
    engine.stop()
    current = record
    setSongKey(readKey(record.key))
    setOpenDemoId(demo)
    shelf.setCurrent(demo === null ? record.id : DEMO + demo)
    lastLength.clear()
    setLoopBars(null)
    engine.setLoop(null)
    batch(() => {
        setExportNote(null)
        setSelected(null)
        closePanel()
        setSoloIds([])
        setRemoved(null)
        setGridNotes({})
        setRollRanges({})
        setSongBars(16)
        setStartBar(0)
        setCycle(0)
    })
    engine.setSolo([])
    engine.setStart(0)
    engine.setCode(record.draft)
    refreshSongs()
    replay()
}

export function newSong() {
    flush()
    const record: SongRecord = { id: newId(), name: freeTitle(UNTITLED, titles()), saved: NEW_SONG, draft: NEW_SONG, changedAt: Date.now() }
    shelf.write(record)
    show(record)
}

export function openDemo(id: string) {
    const record = demoSong(id)
    if (!record) return
    flush()
    show(record, id)
}

export function openSong(id: string) {
    if (id === current?.id) return
    flush()
    const record = shelf.read(id)
    if (record) show(record)
}

export function saveSong() {
    if (!current) return
    current = { ...current, saved: current.draft }
    keepAsOwn()
    flush()
    refreshSongs()
}

export function revertSong() {
    if (!current || current.draft === current.saved) return
    engine.applyEdit({ from: 0, to: engine.getCode().length, insert: current.saved })
    replay()
}

export function renameSong(id: string, name: string): boolean {
    const clean = cleanName(name)
    const record = id === current?.id ? current : shelf.read(id)
    if (!clean || !record) return false
    const renamed = { ...record, name: clean }
    if (id === current?.id) {
        current = renamed
        keepAsOwn()
    }
    shelf.write(renamed)
    refreshSongs()
    return true
}

export function duplicateSong() {
    if (!current) return
    flush()
    const copy: SongRecord = { ...current, id: newId(), name: freeTitle(`${current.name} copy`, titles()), changedAt: Date.now() }
    shelf.write(copy)
    show(copy)
}

export function deleteSong(id: string) {
    flush()
    const record = shelf.read(id)
    if (!record) return
    shelf.remove(id)
    setDeletedSong(record)
    if (id !== current?.id) return refreshSongs()
    const next = shelf.list().flatMap((entry) => shelf.read(entry.id) ?? [])[0]
    if (next) return show(next)
    current = null
    newSong()
}

export function restoreSong() {
    const record = deletedSong()
    if (!record) return
    shelf.write(record)
    setDeletedSong(null)
    refreshSongs()
}

export const listSongs = () => refreshSongs()

// The key is kept with the song, beside its code. It is a setting of the piano roll and not a
// change to the song, so it is not something to save or to go back from.
export function chooseKey(key: Key | null) {
    if (!current) return
    current = { ...current, key: writeKey(key) }
    setSongKey(key)
    flush()
}

const CODE_FILE: FileKind = { extension: 'js', label: 'Strudel code', type: 'text/javascript' }
const AUDIO_FILES: Record<Format, FileKind> = {
    wav: { extension: 'wav', label: 'WAV audio', type: 'audio/wav' },
    mp3: { extension: 'mp3', label: 'MP3 audio', type: 'audio/mpeg' },
}
const EXPORT_KEY = 'weft.export'

const told = (saved: Saved, name: string) => (!saved.saved ? 'Not saved.' : saved.where ? `Saved to ${saved.where}` : `Saved as ${name}, in your downloads folder.`)
const percent = (done: number) => `${Math.round(done * 100)}%`

export function openExport() {
    setExportNote(null)
    setExportOpen(true)
}

export const closeExport = () => setExportOpen(false)
export const keptAudio = (): AudioOptions => readAudio(localStorage.getItem(EXPORT_KEY))

export async function exportCode() {
    if (!current) return
    const name = fileName(current.name, CODE_FILE.extension)
    try {
        setExportNote(told(await saveFile(name, engine.getCode(), CODE_FILE), name))
    } catch (err) {
        setExportNote(`The file could not be saved: ${String((err as Error)?.message ?? err)}`)
    }
}

const SONG_KIND: FileKind = { extension: SONG_FILE, label: 'Weft song', type: 'application/json' }

// The song as one file with the sounds of your own that it uses inside it.
export async function saveSongFile() {
    if (!current) return
    const name = fileName(current.name, SONG_KIND.extension)
    try {
        const code = engine.getCode()
        const used = soundsUsed(code, ownSounds().map((sound) => sound.name))
        const kept = used.length ? (await ownSoundStore.all()).filter((sound) => used.includes(sound.name)) : []
        const sounds = kept.map((sound) => ({ name: sound.name, file: sound.file, type: sound.type, seconds: sound.seconds, data: new Uint8Array(sound.data) }))
        setExportNote(told(await saveFile(name, writeSongFile({ name: current.name, code, key: current.key ?? null, sounds }), SONG_KIND), name))
    } catch (err) {
        setExportNote(`The file could not be saved: ${String((err as Error)?.message ?? err)}`)
    }
}

// A song file, or any file of code, becomes a new song. The sounds that come in a song file are
// added to yours. One whose name is already yours is taken to be the same sound; one whose name
// belongs to another sound gets a new name, in the song's code as well.
export async function openSongFile(file: File) {
    try {
        const read = readSongFile(await file.text(), file.name)
        if (!read) return void setSongNote(`${file.name} is not a song this app can read.`)
        let code = read.code
        let added = 0
        for (const packed of read.sounds) {
            if (ownSounds().some((sound) => sound.name === packed.name)) continue
            const name = soundNameFor(packed.name, engine.soundTaken)
            if (name !== packed.name) code = renameSound(code, packed.name, name)
            const data = packed.data.buffer.slice(packed.data.byteOffset, packed.data.byteOffset + packed.data.byteLength) as ArrayBuffer
            const sound: OwnSound = { name, file: packed.file, seconds: packed.seconds, addedAt: Date.now(), type: packed.type, data }
            await ownSoundStore.put(sound)
            await register(sound)
            setOwnSounds([...ownSounds(), infoOfSound(sound)].sort(byName))
            added++
        }
        flush()
        const record: SongRecord = { id: newId(), name: freeTitle(cleanName(read.name) || UNTITLED, titles()), saved: code, draft: code, changedAt: Date.now(), ...(read.key ? { key: read.key } : {}) }
        shelf.write(record)
        show(record)
        setSongNote(added ? `Opened ${record.name}, with ${added} ${added === 1 ? 'sound' : 'sounds'} of its own, now among yours.` : `Opened ${record.name}.`)
    } catch (err) {
        setSongNote(`${file.name} could not be opened: ${String((err as Error)?.message ?? err)}`)
    }
}

// The song from its first bar to its last, with what still rings after it, as an audio file.
export async function exportAudio(options: AudioOptions) {
    if (!current || exporting()) return
    if (engineState().sounds !== 'ready') return void setExportNote('The sounds are still loading. Try again in a moment.')
    localStorage.setItem(EXPORT_KEY, JSON.stringify(options))
    const kind = AUDIO_FILES[options.format]
    const grade = gradeOf(options)
    const name = fileName(current.name, kind.extension)
    const bars = songLengthNow()
    setExporting(true)
    setExportNote('Making the audio, 0%.')
    try {
        const made = await engine.render({ bars, ringSeconds: RING_SECONDS, sampleRate: grade.sampleRate }, (done) => setExportNote(`Making the audio, ${percent(done)}.`))
        const whole = Math.min(made.channels[0].length, Math.round(bars * made.secondsPerBar * made.sampleRate))
        const length = soundingLength(made.channels, made.sampleRate, whole)
        const peak = peakOf(made.channels, length)
        if (!peak) return void setExportNote('Nothing sounds in this song, so there is no audio to save.')
        const level = levelFor(peak)
        const bytes = grade.kbps
            ? await encodeMp3(made.channels, made.sampleRate, grade.kbps, { length, level }, (done) => setExportNote(`Writing the MP3, ${percent(done)}.`))
            : encodeWav(made.channels, made.sampleRate, { length, level, depth: grade.depth })
        setExportNote('Choose where to save it.')
        const saved = await saveFile(name, bytes, kind).catch((err) => String((err as Error)?.message ?? err))
        if (typeof saved === 'string') return void setExportNote(`The audio was made, but the file could not be saved: ${saved}`)
        const missing = made.missed ? ` ${made.missed} ${made.missed === 1 ? 'sound' : 'sounds'} could not be loaded and ${made.missed === 1 ? 'is' : 'are'} missing from it.` : ''
        setExportNote(told(saved, name) + (saved.saved ? missing : ''))
    } catch (err) {
        setExportNote(`The audio file could not be made: ${String((err as Error)?.message ?? err)}`)
    } finally {
        setExporting(false)
    }
}
