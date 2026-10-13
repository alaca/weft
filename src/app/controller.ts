import { batch, createEffect, createRoot } from 'solid-js'
import { controlText, FILTERS, filterTypeOf, findDef, mixText, writeNumber, type FilterType } from '../controls/catalog'
import { drumChoices } from '../controls/drums'
import { firstMotion, motionText, readMotion, type Motion } from '../controls/motion'
import { callFor, controlOf, valueArg, type ControlView } from '../controls/views'
import { audioCode, audioEdits, barsOfSound, heardIn, JOIN, listFrom, LONGEST_FADE, readLaid, relist, startOf, type Audio, type AudioPlan } from '../song/audio'
import { curveOver, curveText, followSong, readCurve, stretched } from '../song/curves'
import { dropScene, freeSceneName, keepScene, readScenes, renameScene, sceneBar, sceneEdits, type Scene } from '../song/scenes'
import { addVariant, chooseEdit, followChoices, removeVariant, variantBars } from '../song/variants'
import { onSongLink } from '../desktop/links'
import { openInBrowser } from '../desktop/browser'
import { installMenus } from '../desktop/menu'
import { chooseFile } from '../desktop/open'
import { saveFile, savePieces, textPieces, type FileKind, type Saved } from '../desktop/save'
import { createEngine } from '../engine/engine'
import { DEMO } from '../demo/demo'
import { MAX_BARS } from '../song/bars'
import { chordAt, chordsEdit, followerCode, followerEdits, FOLLOW_KINDS, readChords, readFollower, registerEdit, TONES, USUAL_CHORD, type Follower, type FollowKind, type Register } from '../song/chords'
import { meterEdits, meterNow, METERS, readMeter, setMeterNow, sliceSteps } from '../song/meter'
import { fitTempo, readTempoLane, secondsOf, tempoAt, tempoLaneEdit } from '../song/tempo'
import { cleanPresetName, LIBRARY, presetCalls, presetEdits, previewText, PREVIEW_PITCH, readPresets, soundCalls, withPreset, writePresets, type Preset } from '../sounds/presets'
import { keeping } from '../library/kept'
import { cleanName, createShelf, freeTitle, infoOf, NEW_SONG, newId, UNTITLED, type SongInfo, type SongRecord } from '../library/shelf'
import { CODE_LEAST, DEFAULT_LAYOUT, fitShare, fitWidth, isUsual, LEFT_PANELS, MIDDLE_LEAST, readLayout, SOUNDS_LEAST, SOUNDS_WIDTH, usualCode, type Layout, type LeftPanel, type ViewMode } from '../library/layout'
import { fitSoundName, readSongFile, readSource, renameSound, SONG_FILE, SOUND_NAME, soundsUsed, writeSongFileInTurns, type PackedSound } from '../library/songfile'
import { DEFAULT_MIX, fitMix, readMix, type Mix } from '../library/mix'
import { prepareForPublishing, type Prepared } from '../library/publish'
import { withoutLead } from '../library/shrink'
import { turnWhenDue } from '../library/turn'
import { startTake, whyNot, type NoTake, type Take } from '../library/recorder'
import { ownSoundStore, soundNameFor, type OwnSound } from '../library/sounds'
import { readKey, writeKey, type Key } from '../song/scales'
import { gradeOf, readAudio, RING_SECONDS, sizeOf, type AudioOptions, type Format } from '../library/audio'
import { encodeMp3 } from '../library/mp3'
import { encodeWav, encodeWavInTurns, fileName, levelFor, peakOf, soundingLength } from '../library/wav'
import { ZIP_LIMIT, zipWriter } from '../library/zip'
import { analyze } from '../song/analyze'
import { arrangeEdit, arrangeSong, barsOf, readArrangement, removeEdits, repeatEdits, songLength, spaceEdits } from '../song/arrange'
import { addCall, removeCall, renameCalls, setNumber, setString, setTempo as tempoEdit, toggleMute as muteEdit } from '../song/edits'
import {
    clearSteps,
    gridFromEvents,
    lengthEdits,
    paintSteps as paintGridSteps,
    readGrid,
    removeRow,
    resample,
    resize,
    setSteps,
    sourceText,
    stepKind,
    toggleAccent as toggleGridAccent,
    toggleStep as toggleGridStep,
    type Grid,
    type GridRow,
    type GridSource,
    type StepWhat,
} from '../song/grid'
import { convertEdits, isDrums, kitEdits, MUTE, readKit, rowTarget } from '../song/kit'
import { backwards, cellsOf, empty, fitEdit, inOrder, MOST_PARTS, readSlices, recut, shuffled, sliceEdits, sliceRows, slicesCode, type Slices } from '../song/slices'
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
    roomAt,
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
    presetStarter,
    soundStarter,
    starterCode,
    swapEdits,
    textOutside,
    type StarterKind,
} from '../song/patterns'
import type { PatternBlock, PatternEvent, TextEdit } from '../song/types'
import { fits, isLaid, isPreset, isRow, soundEdit, soundTextAt } from '../sounds/apply'
import { catalogue, type SoundItem } from '../sounds/catalog'
import type { Bars } from '../jam/protocol'
import { jamsOpen, jamStage, setJamsOpen, setJamUnread, setSoundsShare, soundsShare } from '../stores/jam'
import { attachJam, leaveJam, tellJam } from './jam'
import { openAccount } from './account'
import { attachPublish, openPublish } from './publish'
import { attachUpdate, lookForNewVersion, lookWith } from './update'
import { SITE } from '../site/api'
import {
    cycle,
    deletedSong,
    engineState,
    sceneWaiting,
    setSceneWaiting,
    setShownVariants,
    shownVariants,
    setTakingKnobs,
    setTrim,
    takingKnobs,
    trim,
    exporting,
    gridNotes,
    openPanel,
    ownPresets,
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
    setSongGuarded,
    setOpenPanel,
    setOwnSoundNote,
    setOwnPresets,
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
    patternKeys,
    setPatternKeys,
    setSongNote,
    playMode,
    setPlayModeValue,
    currentSong,
    startOpen,
    mixerOpen,
    mixNow,
    setMixerOpen,
    setMixNow,
    folded,
    setFolded,
    linkAsk,
    setLinkAsk,
    type PlayMode,
    setTakeOpening,
    setChordLane,
    setMeter,
    setTakeSince,
    setTempoLane,
    takeOpening,
    chordLane,
    takeSince,
    tempoLane,
    setSongs,
    setSoundsOpen,
    setStartBar,
    setStartOpen,
    setClosingSong,
    setUnfolded,
    setStale,
    soloIds,
    song,
    songBars,
    songNote,
    soundsOpen,
    stale,
    startBar,
    unfolded,
} from '../stores/song'

// Where the one song was kept before there could be several. It is read once, to become the
// first song of the shelf.
const FIRST_SONG_KEY = 'weft.song'
const START_KEY = 'weft.start'
const MIX_KEY = 'weft.mix'
// How long after its start the app looks for a newer version of itself.
const UPDATE_AFTER = 5000
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
const shelf = createShelf(keeping)

const keysOf = (record: SongRecord): Record<string, Key> =>
    Object.fromEntries(Object.entries(record.keys ?? {}).flatMap(([id, text]) => {
        const key = readKey(text)
        return key ? [[id, key] as const] : []
    }))
let current: SongRecord | null = null

function refreshSongs() {
    batch(() => {
        setSongs(shelf.list())
        setCurrentSong(current ? infoOf(current) : null)
    })
}

// The place the songs are kept in can be full. A song that could not be written is said in the
// window, with what makes room. It stays in front as it is until it has been written, so what
// was done to it is not lost while the app is open.
const MAKE_ROOM = 'Make room by deleting songs you no longer need: with a song open, the list is under its name.'
let unkept: string | null = null

// What was said about the open song not being kept is taken back once the song is written after
// all, or is gone.
function sayUnkept(note: string | null) {
    if (note === null && unkept !== null && songNote() === unkept) setSongNote(null)
    if (note !== null) setSongNote(note)
    unkept = note
}

function flush(): boolean {
    window.clearTimeout(saveTimer)
    if (!current) return true
    const kept = shelf.write(current)
    sayUnkept(kept ? null : `The changes to ${current.name} are not kept: there is no room left for your songs. ${MAKE_ROOM}`)
    return kept
}

// A song that is new to the shelf. Without room for it nothing else changes.
function keepNew(record: SongRecord): boolean {
    const kept = shelf.write(record)
    if (!kept) setSongNote(`There is no room left for another song. ${MAKE_ROOM}`)
    return kept
}

function keepDraft(code: string) {
    if (!current || code === current.draft) return
    current = { ...current, draft: code, changedAt: Date.now() }
    setCurrentSong(infoOf(current))
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(flush, 500)
}

const titles = () => shelf.list().map((entry) => entry.name)

// The song the app opens with: the one that was open last, or failing that the most recent.
// On a first start there is none; the app comes with no songs of its own, and the start screen
// offers a new one and the songs on the site.
function firstSong(): SongRecord | null {
    const open = shelf.current()
    const found = (open ? shelf.read(open) : null) ?? shelf.list().flatMap((entry) => shelf.read(entry.id) ?? [])[0]
    if (found) return found
    const before = keeping.getItem(FIRST_SONG_KEY)
    if (before === null) return null
    const record: SongRecord = { id: newId(), name: UNTITLED, saved: before, draft: before, changedAt: Date.now() }
    shelf.write(record)
    shelf.setCurrent(record.id)
    return record
}

function onCode(code: string) {
    if (removed() && code !== removed()?.after) setRemoved(null)
    // The tempo of every bar is read with every change of the code, and told to the engine as
    // bars a second: four beats to the bar.
    // So is how its bar is counted, which everything that reads a pattern goes by.
    const counted = readMeter(code)
    setMeterNow(counted)
    setMeter(counted)
    engine.setQuarters(counted.quarters)
    setChordLane(readChords(code))
    const lane = readTempoLane(code)
    setTempoLane(lane)
    engine.setTempoLane(lane ? lane.values.map((bpm) => bpm / (60 * counted.quarters)) : null)
    const next = analyze(code, shownVariants())
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
    const end = playMode() === 'live' ? null : songEnd()
    if (end !== null && now >= end) return engine.stop()
    const whole = Math.floor(now)
    batch(() => {
        setCycle(whole)
        setPosition(now - whole)
        setBeat(Math.min(meterNow().beats - 1, Math.floor((now - whole) * meterNow().beats)))
    })
    frame = requestAnimationFrame(tick)
}

export async function mount(root: HTMLElement): Promise<void> {
    setOwnPresets(readPresets(keeping.getItem(PRESETS_KEY)))
    const startMix = readMix(keeping.getItem(MIX_KEY))
    setMixNow(startMix)
    engine.setMix(startMix)
    current = firstSong()
    if (current) {
        guardAs(current)
        setPatternKeys(keysOf(current))
        applyMode(modeOf(current))
    }
    refreshSongs()
    // The start screen is what the app opens with. It can be skipped, to open straight into the
    // song that was open last, but not when there is no song to open into. The demo has no start
    // screen: it opens into the first of its songs.
    setStartOpen(!DEMO && (!current || keeping.getItem(START_KEY) !== 'skip'))
    const initial = current?.draft ?? ''
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
        if (!next.playing && !next.paused && before.playing) queueMicrotask(drawTakenDown)
        // A scene that was waiting for the next bar when the song was stopped is there at once.
        if (!next.playing && before.playing && sceneWaiting()) queueMicrotask(() => showScene(sceneWaiting() ?? ''))
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
    attachJam({
        engine,
        songName: () => current?.name ?? '',
        songId: () => current?.id ?? null,
        songKeys: () => current?.keys ?? {},
        openAs,
        guardSong,
        startFrom,
        setLoop: followLoop,
        setMode: setPlayMode,
        ownSound: (name) => ownSoundStore.get(name),
        keepSound,
        lendSound: register,
        restoreSound: async (name) => {
            const mine = await ownSoundStore.get(name)
            if (mine) await register(mine)
        },
        replay,
    })
    attachPublish({ prepare: prepareToPublish, preview: previewToPublish, busiestBar, cameFrom: () => current?.source?.id ?? null, published: publishedAs })
    attachUpdate({ keep: flush })
    window.setTimeout(() => void lookForNewVersion(false), UPDATE_AFTER)
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
    const inSong = () => !startOpen() && Boolean(currentSong())
    const alone = () => jamStage() !== 'jamming'
    const tickMenu = await installMenus({
        File: [
            { id: 'weft-file-new', text: 'New Song', keys: 'CmdOrCtrl+N', enabled: alone, action: newSong },
            { id: 'weft-file-open', text: 'Open a File…', keys: 'CmdOrCtrl+O', enabled: alone, action: () => void openAFile() },
            'line',
            { id: 'weft-file-save', text: 'Save', keys: 'CmdOrCtrl+S', enabled: () => inSong() && Boolean(currentSong()?.changed), action: saveSong },
            { id: 'weft-file-revert', text: 'Go Back to the Saved Version', enabled: () => inSong() && Boolean(currentSong()?.changed), action: revertSong },
            { id: 'weft-file-duplicate', text: 'Duplicate', enabled: () => inSong() && alone(), action: duplicateSong },
            'line',
            { id: 'weft-file-export', text: 'Export…', enabled: inSong, action: openExport },
            { id: 'weft-file-publish', text: 'Publish…', enabled: inSong, action: openPublish },
            { id: 'weft-file-account', text: 'Your Account…', action: openAccount },
            'line',
            { id: 'weft-file-close', text: 'Close Song', enabled: () => inSong() && alone(), action: closeSong },
        ],
        View: [
            { id: 'weft-view-both', text: 'Controls and Code', checked: () => viewMode() === 'both', action: () => setView('both') },
            { id: 'weft-view-controls', text: 'Controls Only', checked: () => viewMode() === 'controls', action: () => setView('controls') },
            { id: 'weft-view-code', text: 'Code Only', checked: () => viewMode() === 'code', action: () => setView('code') },
            'line',
            { id: 'weft-view-sounds', text: 'Sounds', checked: soundsOpen, action: toggleSounds },
            { id: 'weft-view-jams', text: 'Jams', checked: jamsOpen, action: toggleJams },
            { id: 'weft-view-mixer', text: 'Mixer', checked: mixerOpen, action: toggleMixer },
            { id: 'weft-view-wave', text: 'Waveform', checked: waveShown, action: toggleWaveform },
            { id: 'weft-view-song', text: 'Song Panel', checked: songShown, action: toggleSongPanel },
            'line',
            { id: 'weft-view-reset', text: 'Reset Layout', action: resetLayout },
        ],
        Help: [
            { id: 'weft-help-docs', text: 'Weft Loom Docs', action: () => void openInBrowser(`${SITE}/docs`) },
            { id: 'weft-help-update', text: 'Check for Updates…', action: () => void lookForNewVersion(true) },
        ],
    })
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
    void onSongLink((id) => void askFromLink(id))
    if (import.meta.env.DEV) (window as any).__weft = { engine, prepareToPublish, openFromSite, askFromLink, lookWith, lookForNewVersion }
}

export const play = () => void engine.evaluate()

// Song plays the bars as they are filled in the Song panel. Live plays every pattern round and
// round, whatever the bars say, which is how a pattern is worked on and how a song is tried out
// before it is arranged.
function applyMode(mode: PlayMode) {
    setPlayModeValue(mode)
    engine.setLive(mode === 'live')
    if (!engineState().playing) setCycle(mode === 'live' ? 0 : (loopBars()?.from ?? startBar()))
}

// The choice is kept with the song: one song is still being put together from its patterns
// while another is arranged and played as a song.
export function setPlayMode(mode: PlayMode) {
    if (playMode() === mode) return
    applyMode(mode)
    tellJam({ k: 'mode', mode })
    if (!current) return
    current = { ...current, mode }
    flush()
}

// A song for which nothing was chosen yet is played as a song when bars have been written for
// one of its patterns, as in a demo, and pattern by pattern when none have.
const modeOf = (record: SongRecord): PlayMode => record.mode ?? (analyze(record.draft).patterns.some((block) => readArrangement(block)) ? 'song' : 'live')

// One step back, or forward again, in everything that changed the song: a click in a grid, a
// knob, a sound, or typing in the code.
export function undoChange() {
    if (engine.undo()) replay()
}

export function redoChange() {
    if (engine.redo()) replay()
}

// The song made to sound as its code now reads. The engine does it in a turn of its own, and
// once for a change that also moves the start, the bars that go round or a solo. A change that
// is one of a run is `held`: a note under a dragged pointer, a key that is held down, a note
// played on the keyboard. The song then follows when the run rests, and about once a second
// while it lasts.
function replay(held = false) {
    engine.replay(held)
}

// The pointer was let go: what its drag held back is played now.
export const replayHeld = () => engine.replayHeld()

// Stop goes back to the beginning of the song, and pause keeps its place. Bars that go round
// are still what plays next.
export function stop() {
    engine.stop()
    if (!loopBars() && startBar() !== 0) startFrom(0)
}

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

export function setControl(id: string, fn: string, value: number) {
    const block = find(id)
    if (!block || stale()) return
    const arg = valueArg(callFor(block, fn))
    if (!arg) return
    const def = findDef(fn)
    // A plain number has the range its knob shows: the usual one, made wider by a number that
    // lies outside it.
    const min = arg.kind === 'slider' ? arg.min : Math.min(def?.min ?? 0, arg.value)
    const max = arg.kind === 'slider' ? arg.max : Math.max(def?.max ?? 1, arg.value)
    const text = writeNumber(Math.min(max, Math.max(min, value)), min, max)
    if (def && !def.wrap && arg === callFor(block, fn)?.args[0]) takeDown(id, fn, arg.value, Number(text))
    if (arg.kind === 'slider' && engine.moveSlider(arg.valueFrom, text)) return
    if (Number(text) === arg.value) return
    // A slider the editor does not know yet is only heard changed when the song is played
    // again. The turn is a run of such changes, so they are held.
    if (arg.kind === 'slider') {
        engine.applyEdit(setNumber(arg, text))
        return replay(true)
    }
    // A plain number can only be heard changed by playing the song again. At its first turn
    // it is put on a slider, with the song played again once, and every turn after that is
    // heard at once.
    engine.applyEdit({ from: arg.from, to: arg.to, insert: `slider(${text}, ${min}, ${max})` })
    replay()
}

// A knob that is turned while the song plays, taken down bar by bar. When the song stops, each
// knob that was turned is drawn over the song: where it stood before for the bars before the
// first turn, then what it was turned to, held from one turn to the next and on to the end.
const takenDown = new Map<string, { id: string; fn: string; before: number; bars: Map<number, number> }>()

function takeDown(id: string, fn: string, before: number, value: number) {
    if (!takingKnobs() || !engineState().playing) return
    const key = `${id}/${fn}`
    const taken = takenDown.get(key) ?? { id, fn, before, bars: new Map<number, number>() }
    taken.bars.set(barNow(), value)
    takenDown.set(key, taken)
}

function drawTakenDown() {
    const all = [...takenDown.values()]
    takenDown.clear()
    if (!all.length || stale()) return
    const length = songLengthNow()
    const edits = all.flatMap(({ id, fn, before, bars }) => {
        const block = find(id)
        const def = findDef(fn)
        const arg = block ? callFor(block, fn)?.args[0] : undefined
        if (!block || !def || !arg || valueArg(callFor(block, fn)) !== arg) return []
        let now = before
        const values = Array.from({ length }, (_, bar) => {
            now = bars.get(bar) ?? now
            return writeNumber(Math.min(def.max, Math.max(def.min, now)), def.min, def.max)
        })
        return [{ from: arg.from, to: arg.to, insert: `"${curveText(values)}"` }]
    })
    if (!edits.length) return
    engine.applyEdit(edits)
    replay()
}

// Switched off, what was taken down so far is drawn at once.
export function takeKnobs(on: boolean) {
    setTakingKnobs(on)
    if (!on) drawTakenDown()
}

export function addControl(id: string, fn: string, value?: number) {
    const block = forEdit(id)
    const def = findDef(fn)
    if (!block || !def || stale() || callFor(block, fn)) return
    engine.applyEdit(addCall(engine.getCode(), block, controlText(def, value ?? def.initial)))
    replay()
}

// A control that moves by itself, or stands still again. Starting, it moves up to where the knob
// stood; stopping, the knob stands at the far end of the motion.
export function setMotion(id: string, fn: string, motion: Motion | null) {
    const block = find(id)
    const call = block ? callFor(block, fn) : undefined
    const def = findDef(fn)
    const arg = call?.args[0]
    if (!call || !def || !arg || stale()) return
    const was = readMotion(call)
    const still = valueArg(call)
    const drawn = readCurve(call)
    if (!was && !still && !drawn) return
    const write = (value: number) => writeNumber(Math.min(def.max, Math.max(def.min, value)), def.min, def.max)
    // A control that was drawn over the song stands still at what it is in the bar the song is at.
    const here = drawn ? Number(curveOver(drawn.values, songLengthNow())[barNow()]) : null
    const text = motion ? motionText(motion, write) : `slider(${write(here ?? was?.to ?? still?.value ?? def.initial)}, ${def.min}, ${def.max})`
    engine.applyEdit({ from: arg.from, to: arg.to, insert: text })
    replay()
}

const barNow = (): number => (engineState().playing || engineState().paused ? cycle() % songLengthNow() : Math.min(startBar(), songLengthNow() - 1))

// A control that is drawn bar by bar over the song, in the Song panel, in place of a knob. It
// starts level, at where the knob stood, and is as long as the song.
export function drawControl(id: string, fn: string) {
    const block = find(id)
    const call = block ? callFor(block, fn) : undefined
    const def = findDef(fn)
    const arg = call?.args[0]
    if (!call || !def || def.wrap || !arg || stale() || readCurve(call)) return
    const still = valueArg(call)
    const moving = readMotion(call)
    if (!moving && still !== arg) return
    const value = writeNumber(Math.min(def.max, Math.max(def.min, moving?.to ?? still?.value ?? def.initial)), def.min, def.max)
    engine.applyEdit({ from: arg.from, to: arg.to, insert: `"${curveText(Array.from({ length: songLengthNow() }, () => value))}"` })
    replay()
}

export function setCurve(id: string, fn: string, values: number[], held = false) {
    const block = find(id)
    const drawn = block ? readCurve(callFor(block, fn)) : null
    const def = findDef(fn)
    if (!drawn || !def || !values.length || stale()) return
    const text = curveText(values.map((value) => writeNumber(Math.min(def.max, Math.max(def.min, value)), def.min, def.max)))
    if (text === drawn.arg.value) return
    engine.applyEdit(setString(drawn.arg, text))
    replay(held)
}

export function startMotion(id: string, fn: string) {
    const block = find(id)
    const def = findDef(fn)
    const still = block ? valueArg(callFor(block, fn)) : null
    if (def && !def.steady && still) setMotion(id, fn, firstMotion(still.value, def.min, def.max))
}

export function removeControl(id: string, fn: string) {
    const block = find(id)
    const call = block ? callFor(block, fn) : undefined
    if (!call || stale()) return
    engine.applyEdit(removeCall(call))
    replay()
}

// A knob that is turned whether or not its line is in the code yet: turned, it is.
export function turnControl(id: string, fn: string, value: number) {
    const block = find(id)
    if (block && callFor(block, fn)) setControl(id, fn, value)
    else addControl(id, fn, value)
}

export const setMix = (id: string, fn: 'volume' | 'pan', value: number) => turnControl(id, fn, value)

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

export function setTempo(bpm: number, held = false) {
    if (stale() || song().tempoLocked || tempoLane() || !Number.isFinite(bpm)) return
    const wanted = Math.round(Math.min(300, Math.max(20, bpm)))
    engine.applyEdit([tempoEdit(song(), wanted), ...refitEdits((60 * meterNow().quarters) / wanted)])
    replay(held)
}

// How long so many bars of the song last, each at its own tempo.
export const songSeconds = (bars: number = songLengthNow()): number => secondsOf(playMode() === 'song' ? tempoLane() : null, bars, song().tempo?.bpm ?? engine.bpm(), meterNow().quarters)

// The song put in another way of counting its bar. Its tempo stays the number it was, and the
// patterns it has stay as they are: a new one gets the steps of the new bar.
export function chooseMeter(label: string) {
    const wanted = METERS.find((one) => one.label === label)
    if (!wanted || stale() || song().tempoLocked || wanted === meterNow()) return
    const edits = meterEdits(engine.getCode(), song(), wanted)
    if (!edits.length) return
    engine.applyEdit([...edits, ...refitEdits((60 * wanted.quarters) / (song().tempo?.bpm ?? engine.bpm()))])
    replay()
}

// ---- chords for the patterns to follow: one for every bar, written once.
export function addChords(): boolean {
    if (stale()) return false
    if (chordLane()) return true
    const edit = chordsEdit(engine.getCode(), song(), Array.from({ length: songLengthNow() }, () => USUAL_CHORD))
    if (!edit) return false
    engine.applyEdit(edit)
    replay()
    return true
}

// The bars from one to another given a chord, as one drag over them leaves them.
export function paintChords(from: number, to: number, chord: string) {
    const lane = chordLane()
    if (stale() || !lane) return
    const length = Math.max(songLengthNow(), lane.values.length)
    const values = Array.from({ length }, (_, bar) => (bar >= Math.min(from, to) && bar <= Math.max(from, to) ? chord : chordAt(lane, bar)))
    const edit = chordsEdit(engine.getCode(), song(), values)
    if (!edit) return
    engine.applyEdit(edit)
    replay()
}

// The chords taken out. The patterns that followed them have nothing to follow until there
// are chords again, and say so as an error in the code.
export function removeChords() {
    if (stale() || !chordLane()) return
    const edit = chordsEdit(engine.getCode(), song(), null)
    if (!edit) return
    engine.applyEdit(edit)
    replay()
}

function followChords(before: number, change: (values: string[]) => string[]): TextEdit[] {
    const lane = chordLane()
    if (!lane || lane.values.length !== before) return []
    const edit = chordsEdit(engine.getCode(), song(), change(lane.values).slice(0, MAX_BARS))
    return edit ? [edit] : []
}

// A new pattern that follows the chords. Without chords there are some first.
export function addFollower(kind: FollowKind): string | null {
    if (!addChords()) return null
    const made = FOLLOW_KINDS.find((one) => one.kind === kind)
    return made ? addStarter(made.name, (name) => followerCode(name, kind, mixText())) : null
}

const followerOf = (id: string): { block: PatternBlock; follower: Follower } | null => {
    const block = find(id)
    const follower = block ? readFollower(engine.getCode(), block) : null
    return block && follower ? { block, follower } : null
}

const toneRows = (cells: number[][]): GridRow[] => Array.from({ length: TONES }, (_, tone) => ({ sound: String(tone + 1), steps: cells.map((cell) => cell.includes(tone)) }))

function changeFollower(id: string, change: (grid: Grid) => { rows: GridRow[]; cycles: number } | null): boolean {
    const found = followerOf(id)
    if (!found || stale()) return false
    const { block, follower } = found
    const next = change({ rows: toneRows(follower.cells), steps: follower.steps, cycles: follower.cycles, perCycle: follower.perCycle })
    if (!next) return false
    const edits = [...followerEdits(follower, cellsOf(next.rows)), ...lengthEdits(block, follower.slow, next.cycles)]
    if (!edits.length) return true
    engine.applyEdit(edits)
    replay()
    return true
}

export const toggleTone = (id: string, tone: number, step: number) => void changeFollower(id, (grid) => ({ rows: toggleGridStep(grid.rows, String(tone + 1), step, grid.steps), cycles: grid.cycles }))

export function paintTones(id: string, tone: number, from: number, to: number, on: boolean) {
    changeFollower(id, (grid) => {
        const rows = paintGridSteps(grid.rows, String(tone + 1), from, to, on, grid.steps)
        return rows ? { rows, cycles: grid.cycles } : null
    })
}

export const setFollowerLength = (id: string, cycles: number) => void changeFollower(id, (grid) => (grid.cycles === cycles ? null : { rows: resize(grid, cycles), cycles }))

export function setFollowerSteps(id: string, perCycle: number) {
    changeFollower(id, (grid) => {
        const rows = resample(grid, perCycle)
        return rows && perCycle !== grid.perCycle ? { rows, cycles: grid.cycles } : null
    })
}

export function setRegister(id: string, register: Register) {
    const found = followerOf(id)
    const edit = found && !stale() ? registerEdit(engine.getCode(), found.block, found.follower, register) : null
    if (!edit) return
    engine.applyEdit(edit)
    replay()
}

// ---- a tempo for every bar. It starts as the tempo of the song in every bar, and is drawn
// from there, the way a knob is drawn over the song.
export function drawTempo() {
    if (stale() || tempoLane() || song().tempoLocked) return
    const usual = fitTempo(song().tempo?.bpm ?? engine.bpm())
    const edit = tempoLaneEdit(engine.getCode(), song(), Array.from({ length: songLengthNow() }, () => usual))
    if (!edit) return
    engine.applyEdit(edit)
    replay()
}

export function setTempoCurve(values: number[], held = false) {
    if (stale() || !tempoLane() || !values.length) return
    const edit = tempoLaneEdit(engine.getCode(), song(), values)
    if (!edit) return
    engine.applyEdit(edit)
    replay(held)
}

// One tempo for the whole song again: the one it is set to.
export function stillTempo() {
    if (stale() || !tempoLane()) return
    const edit = tempoLaneEdit(engine.getCode(), song(), null)
    if (!edit) return
    engine.applyEdit(edit)
    replay()
}

// The tempo of the bar the song is at, which is what the tempo in the top bar shows.
export const tempoNow = (): number | null => {
    const lane = tempoLane()
    return lane && playMode() === 'song' ? tempoAt(lane, engineState().playing || engineState().paused ? cycle() : startBar(), lane.values[0]) : null
}

// A tempo that was drawn over the whole song follows it when the song is made longer or
// shorter, or has bars put into it, as a knob that is drawn does.
function followTempo(before: number, change: (values: string[]) => string[]): TextEdit[] {
    const lane = tempoLane()
    if (!lane || lane.values.length !== before) return []
    const edit = tempoLaneEdit(engine.getCode(), song(), change(lane.values.map(String)).slice(0, MAX_BARS).map(Number))
    return edit ? [edit] : []
}

// The mixer is how the song sounds on this machine. Nothing of it is written into the song.
export function changeMix(part: Partial<Mix>) {
    const next = fitMix({ ...mixNow(), ...part })
    setMixNow(next)
    engine.setMix(next)
    keeping.setItem(MIX_KEY, JSON.stringify(next))
}

export const resetMix = () => changeMix(DEFAULT_MIX)
export const waveformOf = () => engine.waveform()
export const levelsOf = () => engine.levels()
// The meters of the patterns are only worked out while a mixer that shows them is in sight.
export const showMeters = (on: boolean) => engine.setMeters(on)
export const levelOfPattern = (id: string): number => engine.levelOf(id)

const layoutNow = (): Layout => ({
    view: viewMode(),
    sounds: soundsOpen(),
    jams: jamsOpen(),
    mixer: mixerOpen(),
    wave: waveShown(),
    song: songShown(),
    soundsWidth: soundsWidth(),
    codeWidth: codeWidth(),
    soundsShare: soundsShare(),
    folded: folded(),
})

function applyLayout(layout: Layout) {
    batch(() => {
        setViewMode(layout.view)
        setSoundsOpen(layout.sounds)
        setJamsOpen(layout.jams)
        setMixerOpen(layout.mixer)
        setSoundsShare(layout.soundsShare)
        setWaveShown(layout.wave)
        setSongShown(layout.song)
        setSoundsWidth(layout.soundsWidth)
        setCodeWidth(layout.codeWidth)
        setFolded(layout.folded)
    })
}

const keepLayout = () => keeping.setItem(LAYOUT_KEY, JSON.stringify(layoutNow()))

applyLayout(readLayout(keeping.getItem(LAYOUT_KEY)))

export const layoutIsUsual = (): boolean => isUsual(layoutNow())

export function resetLayout() {
    applyLayout(DEFAULT_LAYOUT)
    keepLayout()
}

export function setView(view: ViewMode) {
    setViewMode(view)
    keepLayout()
}

export function toggleMixer() {
    setMixerOpen(!mixerOpen())
    keepLayout()
}

// A panel of the left column is folded to its heading and unfolded again. One that is asked
// for, by its icon or by something that needs it, is unfolded.
const unfold = (panel: LeftPanel) => setFolded(folded().filter((one) => one !== panel))

export function toggleFold(panel: LeftPanel) {
    setFolded(folded().includes(panel) ? folded().filter((one) => one !== panel) : LEFT_PANELS.filter((one) => one === panel || folded().includes(one)))
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
    return middle + (soundsOpen() || jamsOpen() || mixerOpen() ? (soundsWidth() ?? SOUNDS_WIDTH) : 0)
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

// The jam sits under the sounds in the left column, so a sound can be picked while a jam is
// open. Either is shown without the other; with both, the line between them can be dragged.
export function toggleJams() {
    setJamsOpen(!jamsOpen())
    setJamUnread(0)
    keepLayout()
}

export function openJams() {
    if (jamsOpen() && !folded().includes('jams')) return
    setJamsOpen(true)
    unfold('jams')
    setJamUnread(0)
    keepLayout()
}

export function dragShare(wanted: number | null, done: boolean) {
    setSoundsShare(wanted === null ? null : fitShare(wanted))
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
    const drums: Grid | null = kit ? { ...kit, rows: kit.rows.map(({ block: _, muted: __, ...row }) => row) } : (legacy?.grid ?? null)
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

// Whether a pattern can be written as a grid of steps, or as a roll of notes. Asked before a
// drag is drawn over one, and a pattern that cannot be says so in its strip.
export function canWriteDrums(id: string): boolean {
    const block = find(id)
    const can = Boolean(block && (readKit(block) || editableGrid(block)))
    setGridNotes({ ...gridNotes(), [id]: !can })
    return can
}

export function canWriteNotes(id: string): boolean {
    const block = find(id)
    const can = Boolean(block && editableNotes(block))
    setGridNotes({ ...gridNotes(), [id]: !can })
    return can
}

// A run of steps of one sound put in, or taken out, by one drag along its row.
export function paintSteps(id: string, sound: string, from: number, to: number, on: boolean) {
    const changed = changeDrums(id, (drums) => {
        const rows = paintGridSteps(drums.rows, sound, from, to, on, drums.steps)
        return rows ? { rows, cycles: drums.cycles } : null
    })
    if (changed && on && !engineState().playing) previewSound(id, sound)
}

// A louder hit on this step, or an ordinary one again.
export function toggleAccent(id: string, sound: string, step: number) {
    changeDrums(id, (drums) => ({ rows: toggleGridAccent(drums.rows, sound, step, drums.steps), cycles: drums.cycles }))
    if (!engineState().playing) previewSound(id, sound)
}

// ---- what a step has of its own: how loud, how likely, how many times, and a value of its own
// for a few of the row's knobs.

// What the knob of a row stands on for one of those things, which is what every step has until
// a step is given a value of its own.
const knobOf = (id: string, sound: string, what: StepWhat): number | undefined => {
    const fn = stepKind(what).fn
    const row = find(rowTarget(id, sound))
    const arg = fn && row ? valueArg(callFor(row, fn)) : null
    return arg?.value
}

export function setStepValues(id: string, sound: string, what: StepWhat, from: number, values: number[]) {
    // A row that is still written the older way is written with a line of its own first.
    forEdit(rowTarget(id, sound))
    const base = knobOf(id, sound, what)
    changeDrums(id, (drums) => {
        const rows = setSteps(drums.rows, sound, what, from, values, base)
        return rows ? { rows, cycles: drums.cycles } : null
    })
}

export function clearStepValues(id: string, sound: string, what: StepWhat) {
    changeDrums(id, (drums) => {
        const rows = clearSteps(drums.rows, sound, what)
        return rows ? { rows, cycles: drums.cycles } : null
    })
}

// ---- a sample cut into parts, played in any order. Each part is a row of a grid, and the
// steps of the grid are where the sample is cut.
const slicesOf = (id: string): Slices | null => {
    const block = find(id)
    return block ? readSlices(block) : null
}

function changeSlices(id: string, change: (slices: Slices) => { cells: number[][]; cycles: number } | null): boolean {
    const slices = slicesOf(id)
    const next = slices && !stale() ? change(slices) : null
    if (!slices || !next) return false
    const edits = sliceEdits(slices, next.cells, next.cycles)
    if (!edits.length) return true
    engine.applyEdit(edits)
    replay()
    return true
}

// A part is as long as it is. Listening to one of a long recording stops after this long.
const PART_SECONDS = 6

export function hearSlice(id: string, part: number) {
    const slices = slicesOf(id)
    if (slices) engine.previewPart(slices.sound.value, part / slices.parts, (part + 1) / slices.parts, PART_SECONDS)
}

export function toggleSlice(id: string, part: number, step: number) {
    let placed = false
    changeSlices(id, (slices) => {
        const rows = toggleGridStep(sliceRows(slices.cells), String(part + 1), step, slices.parts)
        placed = rows[part].steps[step]
        return { cells: cellsOf(rows), cycles: slices.cycles }
    })
    if (placed && !engineState().playing) hearSlice(id, part)
}

export function paintSlices(id: string, part: number, from: number, to: number, on: boolean) {
    changeSlices(id, (slices) => {
        const rows = paintGridSteps(sliceRows(slices.cells), String(part + 1), from, to, on, slices.parts)
        return rows ? { cells: cellsOf(rows), cycles: slices.cycles } : null
    })
}

export type SliceOrder = 'order' | 'backwards' | 'shuffle' | 'clear'

export function arrangeSlices(id: string, how: SliceOrder) {
    changeSlices(id, (slices) => ({
        cells: how === 'order' ? inOrder(slices.parts) : how === 'backwards' ? backwards(slices.parts) : how === 'clear' ? empty(slices.parts) : shuffled(slices.cells.some((cell) => cell.length) ? slices.cells : inOrder(slices.parts)),
        cycles: slices.cycles,
    }))
}

// A longer pattern is cut no finer than leaves it the most parts there can be.
export function setSliceLength(id: string, cycles: number) {
    changeSlices(id, (slices) => {
        if (cycles === slices.cycles) return null
        const perCycle = [...sliceSteps(meterNow())].reverse().find((resolution) => resolution <= slices.perCycle && resolution * cycles <= MOST_PARTS)
        return perCycle ? { cells: recut(slices, perCycle, cycles), cycles } : null
    })
}

export function setSliceSteps(id: string, perCycle: number) {
    changeSlices(id, (slices) => (perCycle === slices.perCycle || perCycle * slices.cycles > MOST_PARTS ? null : { cells: recut(slices, perCycle, slices.cycles), cycles: slices.cycles }))
}

export function setSliceFit(id: string, fit: boolean) {
    const slices = slicesOf(id)
    if (!slices || stale() || slices.fit === fit) return
    engine.applyEdit(fitEdit(slices, fit))
    replay()
}

const SLICE_PEAKS = 512
export const slicePeaks = (sound: string) => engine.peaksOf(sound, SLICE_PEAKS)

// A sample from the browser as a new pattern that plays it cut into parts.
export function addSlices(item: SoundItem): string | null {
    return item.group === 'samples' || item.group === 'yours' ? addStarter('slices', (name) => slicesCode(name, item.name, mixText())) : null
}

// ---- a recording that plays along the song: a sound of your own that is longer than a bar,
// laid on the bars from one of them on. Where it is, and how it fades, is in the code.
const audioOf = (id: string): { block: PatternBlock; audio: Audio } | null => {
    const block = find(id)
    const audio = block ? readLaid(block) : null
    return block && audio ? { block, audio } : null
}

const secondsOfSound = (name: string): number | null => ownSounds().find((sound) => sound.name === name)?.seconds ?? null

// How long a bar is at the tempo that is written for the song. A recording keeps the speed it
// was made at, so this is what says how many bars it is long.
export const barSecondsNow = (): number => (60 * meterNow().quarters) / (song().tempo?.bpm ?? engine.bpm())

type Laid = Partial<Omit<AudioPlan, 'heard'>>

const planFor = (audio: Audio, laid: Laid, plays: boolean[]): AudioPlan => {
    const bars = laid.bars ?? audio.bars
    const list = laid.list ?? audio.list
    return { bars, list, lateBy: laid.lateBy ?? audio.lateBy, heard: heardIn(list, bars, plays), fadeIn: laid.fadeIn ?? audio.fadeIn, fadeOut: laid.fadeOut ?? audio.fadeOut }
}

// A recording is laid along the bars of the song, so what is done to the bars is done to it:
// `next` is given which bar of it each bar plays and the bars it is heard in, and gives back
// both as they are after the change.
function followAudio(before: number, next: (was: { list: (number | null)[]; plays: boolean[] }, block: PatternBlock, audio: Audio) => Laid & { plays: boolean[] }): TextEdit[] {
    const code = engine.getCode()
    return lanes().flatMap((block) => {
        const audio = readLaid(block)
        if (!audio) return []
        const list = Array.from({ length: before }, (_, bar) => audio.list[bar % audio.list.length])
        const { plays, ...laid } = next({ list, plays: barsOf(block, before) }, block, audio)
        return audioEdits(code, audio, planFor(audio, { list, ...laid }, plays))
    })
}

// The place in the song at which the microphone was opened for a take, for as long as the app
// is open: a take that was sung to the song goes where it was sung.
const takenAt = new Map<string, number>()
let takeAt: number | null = null

// A sound of your own as a new pattern that plays it along the song, from the bar it was
// recorded at, or else from the bar the song is at. Unlike any other new pattern it is in the
// song at once: being in it is what it is for.
export function addAudio(item: SoundItem): string | null {
    const seconds = secondsOfSound(item.name)
    if (item.group !== 'yours' || seconds === null) return null
    const at = Math.max(0, takenAt.get(item.name) ?? barNow())
    const start = Math.floor(at)
    const bars = barsOfSound(seconds, barSecondsNow())
    const list = listFrom(start, bars, songLengthNow())
    return addStarter('audio', (name) => audioCode(name, item.name, bars, list, at - start, mixText()), undefined, (name) =>
        barsEdits(
            name,
            list.map((piece) => piece !== null),
        ),
    )
}

// The recording moved so that it begins at this place in the song, in bars. The bars it is
// heard in move with it, and a song that is too short for it is made longer.
function moveAudio(id: string, to: number) {
    const found = audioOf(id)
    if (!found || stale()) return
    const { block, audio } = found
    const at = Math.max(0, to)
    const start = Math.floor(at + 1e-6)
    const lateBy = Math.max(0, at - start)
    const length = songLengthNow()
    const was = startOf(audio.list)
    const list = listFrom(start, audio.bars, length)
    const plays = barsOf(block, length)
    const untouched = was === null || !readArrangement(block)
    const moved = list.map((piece, bar) => piece !== null && (untouched || (plays[bar - (start - (was ?? start))] ?? false)))
    if (barsEdits(id, moved, undefined, { list, lateBy })) replay()
}

export const audioPlace = (id: string): number | null => {
    const found = audioOf(id)
    const start = found ? startOf(found.audio.list) : null
    return found && start !== null ? start + found.audio.lateBy : null
}

export function setAudioStart(id: string, bar: number) {
    const found = audioOf(id)
    if (found && Number.isFinite(bar)) moveAudio(id, Math.round(bar) + found.audio.lateBy)
}

// Earlier or later by so many seconds: the way a take that was sung a little late is put right.
export function nudgeAudio(id: string, seconds: number) {
    const at = audioPlace(id)
    if (at !== null) moveAudio(id, at + seconds / barSecondsNow())
}

// The bars the recording is heard in: from one bar of the song to another, both part of it.
export function setAudioHeard(id: string, first: number, last: number) {
    const found = audioOf(id)
    if (!found || stale()) return
    const from = Math.max(0, Math.min(first, last))
    const to = Math.min(MAX_BARS - 1, Math.max(first, last))
    // Past the end of the song there can be more of the recording, and the song is made longer for it.
    const list = relist(found.audio, Math.max(songLengthNow(), to + 1))
    if (barsEdits(id, list.map((piece, bar) => piece !== null && piece < found.audio.bars && bar >= from && bar <= to))) replay()
}

// How long the recording takes to come in where it begins to be heard, and to go out where it
// stops. Coming in is done within the bar it begins in. Going out is done after the last bar
// it is heard in, with what the recording has there.
export function setAudioFade(id: string, which: 'in' | 'out', seconds: number, held = false) {
    const found = audioOf(id)
    if (!found || stale() || !Number.isFinite(seconds)) return
    const most = which === 'in' ? Math.min(LONGEST_FADE, barSecondsNow()) : LONGEST_FADE
    const fade = seconds <= JOIN ? 0 : Math.min(most, seconds)
    const length = Math.max(songLengthNow(), found.audio.list.length)
    const edits = audioEdits(engine.getCode(), found.audio, planFor(found.audio, which === 'in' ? { fadeIn: fade } : { fadeOut: fade }, barsOf(found.block, length)))
    if (!edits.length) return
    engine.applyEdit(edits)
    replay(held)
}

// A recording is as many bars long as its seconds make at the tempo of the song. When the
// tempo, the bar or the sound itself changes, the number that says so is written again, and
// the recording is laid out again from where it began. `cut` is what was taken off the start
// of a sound, in seconds: what is left of it stays where it was heard.
function refitEdits(barSeconds: number, cut?: { name: string; seconds: number }): TextEdit[] {
    const code = engine.getCode()
    const length = songLengthNow()
    return lanes().flatMap((block) => {
        const audio = readLaid(block)
        const seconds = audio ? secondsOfSound(audio.sound.value) : null
        if (!audio || seconds === null) return []
        const bars = barsOfSound(seconds, barSeconds)
        const moved = cut?.name === audio.sound.value ? cut.seconds / barSeconds : 0
        if (bars === audio.bars && !moved) return []
        const at = Math.max(0, (startOf(audio.list) ?? 0) + audio.lateBy + moved)
        const start = Math.floor(at + 1e-6)
        const list = listFrom(start, bars, length).slice(0, Math.max(length, audio.list.length))
        return audioEdits(code, audio, planFor(audio, { bars, list, lateBy: Math.max(0, at - start) }, barsOf(block, list.length)))
    })
}

// What a recording needs written again to be in time, when it does. The tempo typed into the
// code is not followed by itself, so this is also asked for from the pattern's own panel.
export const audioFits = (id: string): boolean => {
    const found = audioOf(id)
    const seconds = found ? secondsOfSound(found.audio.sound.value) : null
    return !found || seconds === null || barsOfSound(seconds, barSecondsNow()) === found.audio.bars
}

export function refitAudio() {
    if (stale()) return
    const edits = refitEdits(barSecondsNow())
    if (!edits.length) return
    engine.applyEdit(edits)
    replay()
}

// A stretch of the recording, from a part of its whole length on.
const HEARD_FOR = 4
export function hearAudio(id: string, from: number) {
    const found = audioOf(id)
    if (found) engine.previewPart(found.audio.sound.value, Math.min(0.999, Math.max(0, from)), 1, HEARD_FOR)
}

export const audioSeconds = (id: string): number | null => {
    const found = audioOf(id)
    return found ? secondsOfSound(found.audio.sound.value) : null
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
    if (!text) return null
    const slow = block.calls[1]?.name === 'slow' ? block.calls[1] : null
    if (slow) {
        // One rest played slower is an empty roll of that many bars, as older songs have it.
        const bars = slow.args[0]
        if (text.text.trim() !== '~' || bars?.kind !== 'number' || ![2, 4].includes(bars.value)) return null
        return { grid: { notes: [], steps: 16 * bars.value, cycles: bars.value, perCycle: 16 }, from: text.from, to: text.to, slow }
    }
    const cycles = engine.miniEvents(text.text, 8)
    const found = cycles ? notesFromEvents(cycles) : null
    if (!found) return null
    return { grid: { notes: found.notes, steps: found.perCycle * found.cycles, cycles: found.cycles, perCycle: found.perCycle }, from: text.from, to: text.to, slow: null }
}

function changeNotes(id: string, change: (source: NoteSource) => { notes: Note[]; perCycle: number; cycles: number } | null, held = false): boolean {
    const block = find(id)
    if (!block || stale()) return false
    const source = editableNotes(block)
    const next = source ? change(source) : null
    setGridNotes({ ...gridNotes(), [id]: !source })
    if (!source || !next) return false
    engine.applyEdit(noteEdits(block, source, next.notes, next.perCycle * next.cycles, next.cycles))
    replay(held)
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

// How long a note put into this roll is when nothing says otherwise: as long as the last one
// that was given a length here.
export const newNoteLength = (id: string) => lastLength.get(id) ?? 1

export const hearNotes = (id: string, midis: number[]) => midis.forEach((midi) => previewNoteOf(id, midi))

// One note, or several that start together, as a chord does. Each is as long as the last one
// made here, or as long as it was drawn: `span` is that length as a part of a bar, since the roll
// that drew it may count other steps than the pattern is then written in. Where there is less
// room than that, the note fills the room; where there is none it is left out, and the rest
// still go in. What is remembered for the next note is how long a drawn note came out, not how
// far the pointer went. `heard` says the roll sounded them already, when the pointer went down.
export function addNotesAt(id: string, at: { page: number; time: number; midis: number[]; span?: number; heard?: boolean }): NoteRef | null {
    let added: NoteRef | null = null
    let drawn: number | null = null
    let longest = 0
    const placed: number[] = []
    changeNotes(id, (source) => {
        const { steps, perCycle, cycles } = source.grid
        const start = Math.min(steps - 1, (at.page % cycles) * perCycle + Math.floor(at.time * perCycle))
        drawn = at.span === undefined ? null : Math.max(1, Math.round(at.span * perCycle))
        let notes = source.grid.notes
        for (const midi of at.midis) {
            const length = Math.min(drawn ?? newNoteLength(id), roomAt(notes, start, midi, steps))
            const next = addNote(notes, { start, midi, length }, steps)
            if (!next) continue
            longest = Math.max(longest, length)
            notes = next
            placed.push(midi)
            added ??= { start, midi }
        }
        return placed.length ? { notes, perCycle, cycles } : null
    })
    if (drawn !== null && placed.length) lastLength.set(id, longest)
    if (!at.heard) hearNotes(id, placed)
    return added
}

// For a pattern that is played from the computer's keyboard: one note of it sounded now,
// whatever the song is doing; the step of its roll that the song is nearest to at this moment;
// and a note put on a step.
export const soundNote = (id: string, midi: number) => engine.previewNote(midi, find(id)?.soundName ?? null)

export function rollPlace(id: string): { step: number; perCycle: number; steps: number } | null {
    const block = find(id)
    const source = block && engineState().playing ? editableNotes(block) : null
    if (!source) return null
    const { perCycle, cycles, steps } = source.grid
    const at = ((engine.now() % cycles) + cycles) % cycles
    return { step: Math.round(at * perCycle) % steps, perCycle, steps }
}

export function putNote(id: string, start: number, midi: number): boolean {
    return changeNotes(id, (source) => {
        const next = addNote(source.grid.notes, { start, midi, length: 1 }, source.grid.steps)
        return next ? { notes: next, perCycle: source.grid.perCycle, cycles: source.grid.cycles } : null
    }, true)
}

export const addNoteAt = (id: string, at: { page: number; time: number; midi: number }): NoteRef | null => addNotesAt(id, { page: at.page, time: at.time, midis: [at.midi] })

export function removeNoteAt(id: string, ref: NoteRef) {
    changeNotes(id, (source) => ({ notes: removeNote(source.grid.notes, ref), perCycle: source.grid.perCycle, cycles: source.grid.cycles }))
}

export function moveNoteTo(id: string, ref: NoteRef, to: NoteRef, held = false): NoteRef | null {
    const moved = changeNotes(id, (source) => {
        const next = moveNote(source.grid.notes, ref, to, source.grid.steps)
        return next ? { notes: next, perCycle: source.grid.perCycle, cycles: source.grid.cycles } : null
    }, held)
    if (moved && to.midi !== ref.midi) previewNoteOf(id, to.midi)
    return moved ? to : null
}

export function resizeNoteTo(id: string, ref: NoteRef, length: number, held = false): boolean {
    const resized = changeNotes(id, (source) => {
        const current = source.grid.notes.find((note) => note.start === ref.start && note.midi === ref.midi)
        if (!current || current.length === length) return null
        const next = resizeNote(source.grid.notes, ref, length, source.grid.steps)
        return next ? { notes: next, perCycle: source.grid.perCycle, cycles: source.grid.cycles } : null
    }, held)
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

function addStarter(base: string, code: (name: string) => string, range?: { low: number; high: number }, into: (name: string, length: number) => void = restEverywhere): string | null {
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
    if (patternKeys()[name]) keepKeys(without(patternKeys(), name))
    const length = songLengthNow()
    // The pattern is written and then put to rest in every bar, which is two changes of the
    // code. What the window does after a change of the code is done once, after both.
    batch(() => {
        engine.applyEdit(appendPattern(engine.getCode(), code(name)))
        into(name, length)
    })
    replay()
    select(name)
    return name
}

// A pattern that is added is in none of the bars of the song: it is there to be worked on, and
// is put into the song where it is wanted. Live, it is heard at once with every other pattern.
function restEverywhere(id: string, length: number) {
    const block = find(id)
    const edit = block ? arrangeEdit(engine.getCode(), block, Array<boolean>(length).fill(false)) : null
    if (edit) engine.applyEdit(edit)
}

export function addPattern(kind: StarterKind): string | null {
    const starter = PATTERN_STARTERS.find((entry) => entry.kind === kind)
    return starter ? addStarter(starter.name, (name) => starterCode(kind, name), starter.range) : null
}

// The notes a new roll shows first, around the note a sound is tried out on.
const rangeAround = (pitch: number) => ({ low: pitch - 8, high: pitch + 11 })

// A sound dragged from the browser and let go where there is no pattern starts one with it.
export function addPatternWith(item: SoundItem): string | null {
    const preset = isPreset(item) ? presetOf(item.name) : undefined
    if (isPreset(item)) return preset ? addStarter(preset.kind === 'bass' ? 'bass' : 'melody', (name) => presetStarter(name, preset.calls), rangeAround(preset.pitch ?? PREVIEW_PITCH)) : null
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
    keepKeys(carry(patternKeys(), id, name))
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
    keepKeys(patternKeys()[id] ? { ...patternKeys(), [name]: patternKeys()[id] } : without(patternKeys(), name))
    const length = songLengthNow()
    batch(() => {
        engine.applyEdit(duplicateEdit(engine.getCode(), block, name))
        restEverywhere(name, length)
    })
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
    unfold('sounds')
    keepLayout()
}

export function closeSounds() {
    setSoundsOpen(false)
    keepLayout()
}

export const toggleSounds = () => (soundsOpen() ? closeSounds() : openSounds())

// Yours are the sounds the app keeps for you, and no others: a sound that is only known to the
// engine under such a name is not shown as one.
export const soundCatalogue = (): SoundItem[] => {
    const kept = new Set(ownSounds().map((sound) => sound.name))
    return [...catalogue(engine.sounds(), engine.kitNames()).filter((item) => item.group !== 'yours' || kept.has(item.name)), ...allPresets().map(presetItem)]
}

// ---- presets. A preset is listed with the sounds, under its own heading: the ones you saved
// first, then the ones the app comes with.
const PRESETS_KEY = 'weft.presets'
const presetItem = (preset: Preset): SoundItem => ({ group: 'presets', name: preset.id, label: preset.name, parts: [] })
export const allPresets = (): Preset[] => [...ownPresets(), ...LIBRARY]
export const presetOf = (id: string): Preset | undefined => allPresets().find((preset) => preset.id === id)

function keepPresets(next: Preset[]): boolean {
    try {
        keeping.setItem(PRESETS_KEY, writePresets(next))
    } catch {
        return false
    }
    setOwnPresets(next)
    return true
}

// The sound of a pattern that plays notes, kept under a name. Says what came of it.
export function savePreset(id: string, text: string): string {
    const block = find(id)
    const name = cleanPresetName(text)
    if (!block || isDrums(block) || isLaid(block)) return 'Only a pattern that plays notes has a sound to save.'
    if (!name) return 'Give the preset a name first.'
    const calls = presetCalls(engine.getCode(), block)
    if (!calls.length) return 'This pattern has no sound of its own yet. Choose one in the Sounds panel first.'
    const replaced = ownPresets().some((preset) => preset.name.toLowerCase() === name.toLowerCase())
    if (!keepPresets(withPreset(ownPresets(), name, calls))) return 'There is no room left to keep it. Remove a preset or a song you no longer need.'
    return `${replaced ? 'Saved over' : 'Saved as'} ${name}. It is under Presets in the Sounds panel.`
}

export const removePreset = (id: string) => void keepPresets(ownPresets().filter((preset) => preset.id !== id))

const PAD_SECONDS = 1.4

export function hearPreset(id: string) {
    const preset = presetOf(id)
    if (!preset) return
    const chosen = selected()
    const block = chosen ? find(chosen) : undefined
    // On the pattern that would take it, it is heard on a note of that pattern.
    const pitch = block && !isDrums(block) ? eventsOf(block.id, 0).find((event) => event.midi !== null)?.midi : null
    engine.previewText(previewText(preset.calls, pitch ?? preset.pitch ?? PREVIEW_PITCH), preset.kind === 'pad' ? PAD_SECONDS : 0.6)
}

export function usePreset(id: string, presetId: string) {
    const block = find(id)
    const preset = presetOf(presetId)
    if (!block || !preset || stale() || isDrums(block)) return
    engine.applyEdit(presetEdits(engine.getCode(), block, preset.calls))
    replay()
}

export const hasSound = (id: string): boolean => {
    const block = find(id)
    return Boolean(block) && soundCalls(block!).length > 0
}

export function hearSound(item: SoundItem, part?: string) {
    if (item.group === 'presets') return hearPreset(item.name)
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
    if (isPreset(item)) return usePreset(id, item.name)
    if (isRow(block, item)) return addRow(id, item.name)
    engine.applyEdit(soundEdit(engine.getCode(), block, item))
    // Another recording is another length, laid out from where the one before began.
    const refit = isLaid(block) ? refitEdits(barSecondsNow()) : []
    if (refit.length) engine.applyEdit(refit)
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
    // A preset is a sound and not a name: over a pattern that plays notes it becomes its sound.
    if (isPreset(item)) return void (block && fits(block, item.group) && usePreset(block.id, item.name))
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
    const before = ownUrls.get(sound.name)
    const url = URL.createObjectURL(new Blob([sound.data], { type: sound.type }))
    ownUrls.set(sound.name, url)
    await engine.addSound(sound.name, url)
    if (before) URL.revokeObjectURL(before)
}

// A sound that came from somewhere else, a song file or the other person in a jam, kept among
// yours from then on.
async function keepSound(sound: OwnSound) {
    if (await ownSoundStore.get(sound.name)) throw new Error(`There is already a sound called ${sound.name}.`)
    await ownSoundStore.put(sound)
    await register(sound)
    setOwnSounds([...ownSounds().filter((other) => other.name !== sound.name), infoOfSound(sound)].sort(byName))
}

// The drum kits have to be known first: a sound of your own is made known in every one of them.
async function loadOwnSounds() {
    try {
        const kept = await ownSoundStore.all()
        // A sound of yours never stands in for one that comes with the app. One that got such
        // a name, from a file opened before the app knew its own sounds, is given another.
        for (const sound of kept) {
            if (!engine.soundTaken(sound.name)) continue
            const name = sound.name
            sound.name = soundNameFor(name, (wanted) => engine.soundTaken(wanted) || kept.some((other) => other.name === wanted) || !fitSoundName(wanted))
            await ownSoundStore.put(sound)
            await ownSoundStore.remove(name)
        }
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
            const sound: OwnSound = { name: soundNameFor(file.name, (wanted) => engine.soundTaken(wanted) || !fitSoundName(wanted)), file: file.name, seconds, addedAt: Date.now(), type: file.type, data }
            await ownSoundStore.put(sound)
            await register(sound)
            setOwnSounds([...ownSounds(), infoOfSound(sound)].sort(byName))
        } catch {
            refused.push(file.name)
        }
    }
    setOwnSoundNote(refused.length ? `${refused.join(', ')} could not be read as sound, so ${refused.length === 1 ? 'it was' : 'they were'} not added.` : null)
}

// A take from the microphone becomes a sound of your own, called recording, recording_2 and so on.
let take: Take | null = null

const QUIET_TAKE = 0.001
const TAKE_LEVEL = 0.9
const MOST_GAIN = 60

// Each way the microphone can fail, with what can be done about it.
const NO_TAKE: Record<NoTake, string> = {
    unreachable: 'The microphone could not be used: this window has no way to reach one. In the desktop app, quit and start it again, so that it is built with the microphone allowed.',
    refused:
        'The microphone could not be used: the system did not allow it. Open System Settings, Privacy and Security, Microphone, and allow Weft Loom there, or the terminal it was started from. Then press Record again.',
    silent:
        'The take is silent. That is what the system gives an app it has not allowed to use the microphone, and what a muted input gives. Open System Settings, Privacy and Security, Microphone, and allow Weft Loom there, or the terminal it was started from; check the input level under Sound. Then press Record again.',
    missing: 'The microphone could not be used: none was found. Plug one in, or choose an input in the sound settings of the system, and press Record again.',
    other: 'The microphone could not be used.',
}

// The window goes on answering while the microphone opens, so a second press in that time is
// not taken for a second take.
export async function recordTake() {
    if (take || takeOpening()) return
    setOwnSoundNote(null)
    setTakeOpening(true)
    try {
        take = await startTake()
        takeAt = engineState().playing && playMode() === 'song' ? Math.max(0, engine.now()) : null
        setTakeSince(Date.now())
    } catch (err) {
        const refused = whyNot(err)
        setOwnSoundNote(`${NO_TAKE[refused.why]}${refused.why === 'other' ? ` (${refused.message})` : ''}`)
    } finally {
        setTakeOpening(false)
    }
}

export async function keepTake() {
    const made = take
    const at = takeAt
    take = null
    takeAt = null
    setTakeSince(null)
    if (!made) return
    const had = new Set(ownSounds().map((sound) => sound.name))
    try {
        const file = await made.stop().finally(() => engine.micWasUsed())
        if (!file) return void setOwnSoundNote('Nothing was recorded.')
        // A microphone is often set low, so a take is brought up to a level that is heard, and
        // one with nothing in it is not kept. It is stored as a plain WAV file either way.
        const heard = await engine.decodeAudio(await file.arrayBuffer())
        if (!heard) return void (await addOwnSounds([file]))
        const peak = peakOf(heard.channels)
        if (peak < QUIET_TAKE) return void setOwnSoundNote(NO_TAKE.silent)
        const level = Math.min(MOST_GAIN, TAKE_LEVEL / peak)
        const bytes = await encodeWavInTurns(heard.channels, heard.sampleRate, { level })
        await addOwnSounds([new File([bytes.buffer as ArrayBuffer], 'recording.wav', { type: 'audio/wav' })])
        const kept = ownSounds().find((sound) => !had.has(sound.name))
        if (kept && at !== null) takenAt.set(kept.name, at)
    } catch (err) {
        const refused = whyNot(err)
        setOwnSoundNote(`${NO_TAKE[refused.why]}${refused.why === 'other' ? ` (${refused.message})` : ''}`)
    }
}

export const takingNow = (): boolean => takeSince() !== null

// A sound of your own cut shorter: its start and its end taken off, the way a take is tidied
// after it was recorded. The sound keeps its name, so every song that uses it plays the part
// that was kept. What is cut away is gone.
const TRIM_PEAKS = 480
const SHORTEST = 0.02
let trimmed: { channels: Float32Array[]; sampleRate: number } | null = null

export async function openTrim(name: string) {
    const sound = await ownSoundStore.get(name).catch(() => null)
    const heard = sound ? await engine.decodeAudio(sound.data.slice(0)) : null
    if (!sound || !heard || !heard.channels[0]?.length) return void setOwnSoundNote(`${name} could not be read as sound, so it cannot be cut here.`)
    trimmed = heard
    const frames = heard.channels[0].length
    const peaks = Array.from({ length: TRIM_PEAKS }, (_, at) => {
        let peak = 0
        const end = Math.floor(((at + 1) * frames) / TRIM_PEAKS)
        for (let frame = Math.floor((at * frames) / TRIM_PEAKS); frame < end; frame++) for (const channel of heard.channels) peak = Math.max(peak, Math.abs(channel[frame]))
        return peak
    })
    const seconds = frames / heard.sampleRate
    setTrim({ name, seconds, peaks, from: 0, to: seconds })
}

export function moveTrim(from: number, to: number) {
    const now = trim()
    if (!now) return
    const start = Math.min(Math.max(0, from), now.seconds - SHORTEST)
    setTrim({ ...now, from: start, to: Math.min(now.seconds, Math.max(start + SHORTEST, to)) })
}

export function hearTrim() {
    const now = trim()
    if (now) engine.previewPart(now.name, now.from / now.seconds, now.to / now.seconds, Math.min(OWN_PREVIEW_SECONDS, now.to - now.from))
}

export function closeTrim() {
    trimmed = null
    setTrim(null)
}

export async function keepTrim() {
    const now = trim()
    const heard = trimmed
    const sound = now ? await ownSoundStore.get(now.name).catch(() => null) : null
    if (!now || !heard || !sound) return closeTrim()
    const from = Math.round(now.from * heard.sampleRate)
    const to = Math.round(now.to * heard.sampleRate)
    if (from > 0 || to < heard.channels[0].length) {
        const channels = heard.channels.map((channel) => channel.subarray(from, to))
        const bytes = await encodeWavInTurns(channels, heard.sampleRate)
        const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
        const next: OwnSound = { ...sound, file: sound.file.replace(/\.[^.]+$/, '') + '.wav', type: 'audio/wav', seconds: (to - from) / heard.sampleRate, data }
        await ownSoundStore.put(next)
        await register(next)
        setOwnSounds([...ownSounds().filter((other) => other.name !== next.name), infoOfSound(next)].sort(byName))
        // Where the sound plays along the song, what is left of it stays where it was.
        const edits = stale() ? [] : refitEdits(barSecondsNow(), { name: next.name, seconds: from / heard.sampleRate })
        if (edits.length) engine.applyEdit(edits)
        replay()
    }
    closeTrim()
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
    // Muted or not, a pattern plays the same notes, so the mark that mutes it is left out.
    const from = block.labelFrom >= block.from && block.labelTo <= block.to ? code.slice(block.from, block.labelFrom) + block.label.replace(/^_+|_+$/g, '') : ''
    const begin = from ? block.labelTo : block.from
    const own = from + (bars ? code.slice(begin, bars.call.from) + code.slice(bars.call.to, block.to) : code.slice(begin, block.to))
    return `${own}\u0000${textOutside(code, song())}`
}

const lanes = (): PatternBlock[] => {
    const seen = new Set<string>()
    return song().patterns.filter((block) => !seen.has(block.id) && Boolean(seen.add(block.id)))
}

// `painted` are the bars that were filled with the version of the pattern that is in sight,
// when the pattern has versions: those bars take that version.
export function setBars(id: string, bars: boolean[], painted?: { from: number; to: number }) {
    if (barsEdits(id, bars, painted)) replay()
}

// The bars of a pattern written, and with them everything that is as long as the song. `laid`
// is where a recording is put in the same turn, when the pattern is one. True when the code
// was changed.
function barsEdits(id: string, bars: boolean[], painted?: { from: number; to: number }, laid?: Laid): boolean {
    const block = find(id)
    if (!block || stale()) return false
    const before = songLengthNow()
    const { edits, length } = arrangeSong(engine.getCode(), lanes(), id, bars, before)
    // What is drawn over the song is as long as the song, and stays so.
    if (length !== before) edits.push(...followChords(before, (values) => stretched(values, length)), ...followTempo(before, (values) => stretched(values, length)), ...followSong(lanes(), before, (values) => stretched(values, length)), ...followChoices(lanes(), before, (kinds) => stretched(kinds.map(String), length).map(Number), painted ? id : undefined))
    edits.push(
        ...followAudio(before, (was, other, audio) => {
            const mine = other.id === id ? laid : undefined
            return {
                ...mine,
                list: relist({ ...audio, bars: mine?.bars ?? audio.bars, list: mine?.list ?? was.list }, length),
                plays: Array.from({ length }, (_, bar) => (other.id === id ? bars[bar] : was.plays[bar]) ?? false),
            }
        }),
    )
    if (painted && block.variants) {
        const kinds = stretched(variantBars(block, before).map(String), length).map(Number)
        const choice = chooseEdit(
            block,
            kinds.map((kind, bar) => (bar >= painted.from && bar <= painted.to ? block.variants!.shown : kind)),
        )
        if (choice) edits.push(choice)
    }
    setSongBars(length)
    if (startBar() >= length) startFrom(0)
    if (!edits.length) return false
    engine.applyEdit(edits)
    return true
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
    tellJam({ k: 'start', bar })
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
    tellJam({ k: 'loop', range: { from, to } })
}

// The bars the other person in a jam set to go round, or took away. They are taken as they
// come: the song they belong to may have grown on the way, by changes that arrive apart.
function followLoop(range: Bars | null) {
    setLoopBars(range)
    engine.setLoop(range)
    if (!engineState().playing) setCycle(range ? range.from : startBar())
}

export function clearLoop() {
    if (!loopBars()) return
    setLoopBars(null)
    engine.setLoop(null)
    if (!engineState().playing) setCycle(startBar())
    tellJam({ k: 'loop', range: null })
}

// The bars that go round once more, straight after themselves, in every pattern.
export function repeatLoop() {
    const range = loopBars()
    if (!range || stale()) return
    const before = songLengthNow()
    const { edits, length } = repeatEdits(engine.getCode(), lanes(), range.from, range.to, before)
    const again = <T,>(values: T[]) => [...values.slice(0, range.to), ...values.slice(range.from, range.to), ...values.slice(range.to)].slice(0, length)
    edits.push(...followChords(before, again), ...followTempo(before, again), ...followSong(lanes(), before, again), ...followChoices(lanes(), before, again), ...followAudio(before, (was) => ({ list: again(was.list), plays: again(was.plays) })))
    setSongBars(length)
    if (edits.length) engine.applyEdit(edits)
    const moved = { from: range.to, to: Math.min(length, range.to + (range.to - range.from)) }
    setLoopBars(moved)
    engine.setLoop(moved)
    if (!engineState().playing) setCycle(moved.from)
    tellJam({ k: 'loop', range: moved })
    replay()
}

// The bars that go round taken out of the song, in every pattern. A song is not emptied this
// way: its only bars stay.
export function removeLoop() {
    const range = loopBars()
    const before = songLengthNow()
    if (!range || stale() || range.to - range.from >= before) return
    const { edits, length } = removeEdits(engine.getCode(), lanes(), range.from, range.to, before)
    const without = <T,>(values: T[]) => [...values.slice(0, range.from), ...values.slice(range.to)]
    edits.push(...followChords(before, without), ...followTempo(before, without), ...followSong(lanes(), before, without), ...followChoices(lanes(), before, without), ...followAudio(before, (was) => ({ list: without(was.list), plays: without(was.plays) })))
    clearLoop()
    setSongBars(length)
    if (edits.length) engine.applyEdit(edits)
    startFrom(Math.min(range.from, length - 1))
    replay()
}

// As many empty bars put in before the ones that go round, in every pattern. The empty ones
// are then the ones that go round: they are where the work goes on. A knob that is drawn
// over the song stays through them at what it is where they begin.
export function spaceLoop() {
    const range = loopBars()
    const before = songLengthNow()
    if (!range || stale()) return
    const { edits, length } = spaceEdits(engine.getCode(), lanes(), range.from, range.to, before)
    const spaced = <T,>(values: T[]) => [...values.slice(0, range.from), ...Array.from({ length: range.to - range.from }, () => values[range.from]), ...values.slice(range.from)].slice(0, length)
    // A recording rests through the empty bars and goes on after them.
    const apart = <T,>(values: T[], rest: T) => [...values.slice(0, range.from), ...Array.from({ length: range.to - range.from }, () => rest), ...values.slice(range.from)].slice(0, length)
    edits.push(...followChords(before, spaced), ...followTempo(before, spaced), ...followSong(lanes(), before, spaced), ...followChoices(lanes(), before, spaced), ...followAudio(before, (was) => ({ list: apart(was.list, null), plays: apart(was.plays, false) })))
    setSongBars(length)
    if (edits.length) engine.applyEdit(edits)
    replay()
}

// ---- the versions of a pattern: the same sound and knobs playing one thing in one part of
// the song and another in the next. The one in sight is the one the grid or the roll shows
// and changes, and the one that bars are filled with in the Song panel.
export function showVariant(id: string, index: number) {
    if (shownVariants()[id] === index) return
    setShownVariants({ ...shownVariants(), [id]: index })
    const next = analyze(engine.getCode(), shownVariants())
    if (!next.error) setSong(next)
}

export function addVariantOf(id: string) {
    const block = find(id)
    const made = block && !stale() ? addVariant(engine.getCode(), block, songLengthNow()) : null
    if (!made) return
    setShownVariants({ ...shownVariants(), [id]: made.index })
    engine.applyEdit(made.edit)
    replay()
}

export function removeVariantOf(id: string, index: number) {
    const block = find(id)
    const edits = block && !stale() ? removeVariant(engine.getCode(), block, index, songLengthNow()) : null
    if (!edits) return
    const shown = block?.variants?.shown ?? 0
    setShownVariants({ ...shownVariants(), [id]: Math.max(0, shown > index || shown === index ? shown - 1 : shown) })
    engine.applyEdit(edits)
    replay()
}

// ---- scenes: sets of patterns that play together, kept as lines of the song and chosen
// while it plays. A scene that is chosen while the song plays comes in on a bar, so that what
// changes changes on the beat. Stopped, it is there at once.
//
// The notes of a bar are taken up to a third of a second before they sound, so the code is
// changed and the song played again that long before the bar and a little more, which is what
// the change itself takes. The engine is told the bar, and switches each pattern exactly there.
const SCENE_LEAD = 0.45
let sceneTimer = 0

export const scenesOf = (code: string): Scene[] => readScenes(code)
export const codeNow = (): string => engine.getCode()

export function keepSceneNow() {
    if (stale()) return
    const code = engine.getCode()
    const edit = keepScene(code, song().patterns, freeSceneName(readScenes(code)))
    if (edit) engine.applyEdit(edit)
}

function showScene(name: string, bar?: number) {
    window.clearTimeout(sceneTimer)
    setSceneWaiting(null)
    const scene = readScenes(engine.getCode()).find((one) => one.name === name)
    const edits = scene && !stale() ? sceneEdits(song().patterns, scene) : []
    if (!edits.length) return
    engine.applyEdit(edits)
    if (bar !== undefined) engine.comeInAt(bar)
    replay()
}

export function chooseScene(name: string) {
    if (stale()) return
    window.clearTimeout(sceneTimer)
    if (!engineState().playing) return showScene(name)
    const { bar, wait } = sceneBar(engine.now(), engine.barSeconds(), SCENE_LEAD)
    setSceneWaiting(name)
    sceneTimer = window.setTimeout(() => showScene(name, bar), wait * 1000)
}

export function removeScene(name: string) {
    const code = engine.getCode()
    const scene = readScenes(code).find((one) => one.name === name)
    if (scene && !stale()) engine.applyEdit(dropScene(code, scene))
}

export function nameScene(name: string, next: string) {
    const code = engine.getCode()
    const scene = readScenes(code).find((one) => one.name === name)
    const edit = scene && !stale() ? renameScene(code, scene, next) : null
    if (edit) engine.applyEdit(edit)
}

export const restsNow = (id: string): boolean => {
    const block = find(id)
    const written = block ? readArrangement(block)?.bars : undefined
    return Boolean(written && playMode() === 'song' && engineState().playing && !written[cycle() % written.length])
}

// A jam is on one song. Opening another is leaving it.
function show(record: SongRecord) {
    if (jamStage() === 'jamming') leaveJam()
    engine.stop()
    // The song that was open may be from someone else. The guard stays up until its code has
    // made way for the code of the song that is opened.
    engine.setGuard(true)
    current = record
    setPatternKeys(keysOf(record))
    setStartOpen(false)
    shelf.setCurrent(record.id)
    lastLength.clear()
    setLoopBars(null)
    engine.setLoop(null)
    applyMode(modeOf(record))
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
    guardAs(record)
    refreshSongs()
    replay()
}

// A song is code, and the app does what code says. One that came from someone else, in a file
// or in a jam, and one that someone else has had their hands on, is therefore only played while
// all of it is music code. Its owner can lift that for a song they trust, but not during a jam.
function guardAs(record: SongRecord) {
    // In the demo every song is played that way, also its own: what is typed there runs on the
    // site's address, and somebody can be talked into pasting what they have not read.
    const guarded = DEMO || Boolean(record.guarded)
    engine.setGuard(guarded)
    setSongGuarded(guarded)
}

function guardSong() {
    if (!current || current.guarded) return
    current = { ...current, guarded: true }
    guardAs(current)
    flush()
}

export function trustSong() {
    if (DEMO || !current || !current.guarded || jamStage() === 'jamming') return
    const { guarded: _, ...trusted } = current
    current = trusted
    guardAs(current)
    flush()
    replay()
}

// The song of the person who invited you to a jam, as a song of your own from the moment you join.
function openAs(name: string, code: string, keys: Record<string, string>, mode: PlayMode): boolean {
    if (!flush()) return false
    const kept = Object.fromEntries(Object.entries(keys).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    const record: SongRecord = { id: newId(), name: freeTitle(cleanName(name) || UNTITLED, titles()), saved: code, draft: code, changedAt: Date.now(), mode, guarded: true, ...(Object.keys(kept).length ? { keys: kept } : {}) }
    if (!keepNew(record)) return false
    show(record)
    return true
}

// What the start screen lists under your songs: each with how fast it is and how many patterns
// it has, read from the song as it was last worked on.
export type RecentSong = SongInfo & { bpm: number | null; patterns: number; onSite: boolean }

export function recentSongs(): RecentSong[] {
    return shelf.list().flatMap((info) => {
        const record = shelf.read(info.id)
        if (!record) return []
        const read = analyze(record.draft)
        return [{ ...info, bpm: read.tempo?.bpm ?? null, patterns: read.patterns.length, onSite: Boolean(record.publishedAs) }]
    })
}

// Closing a song goes back to the start screen. Nothing is lost by it: the work is kept as it
// goes. A song with changes since it was saved asks first whether to save them, because saving
// marks the version that can be gone back to.
function toStart() {
    leaveJam()
    engine.stop()
    setSongNote(null)
    flush()
    refreshSongs()
    batch(() => {
        setClosingSong(false)
        setStartOpen(true)
    })
}

export function closeSong() {
    if (!current || jamStage() === 'jamming') return
    if (current.draft !== current.saved) return void setClosingSong(true)
    toStart()
}

export function closeSaved() {
    saveSong()
    toStart()
}

export const closeUnsaved = () => toStart()
export const keepOpen = () => setClosingSong(false)

// Going on with the song that was open: the start screen is put away and the song is there.
export function goOn() {
    if (current) setStartOpen(false)
}

// The song that was published keeps the name it has on the site, so the start screen can mark it.
function publishedAs(id: string) {
    if (!current) return
    current = { ...current, publishedAs: id }
    flush()
}

export function newSong() {
    if (!flush()) return
    const record: SongRecord = { id: newId(), name: freeTitle(UNTITLED, titles()), saved: NEW_SONG, draft: NEW_SONG, changedAt: Date.now() }
    if (keepNew(record)) show(record)
}

export function openSong(id: string) {
    if (id === current?.id || !flush()) return
    const record = shelf.read(id)
    if (record) show(record)
}

export function saveSong() {
    if (!current) return
    current = { ...current, saved: current.draft }
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
        flush()
    } else if (!shelf.write(renamed)) return false
    refreshSongs()
    return true
}

export function duplicateSong() {
    if (!current || !flush()) return
    const copy: SongRecord = { ...current, id: newId(), name: freeTitle(`${current.name} copy`, titles()), changedAt: Date.now() }
    if (keepNew(copy)) show(copy)
}

// The open song as it was in front, when it was deleted with changes that were not kept. Those
// changes are nowhere else, so it is held for as long as the song can be put back.
let deletedFront: SongRecord | null = null

export function deleteSong(id: string) {
    const kept = flush()
    const record = shelf.read(id)
    if (!record) return
    shelf.remove(id)
    setDeletedSong(record)
    deletedFront = id === current?.id && !kept ? current : null
    if (id !== current?.id) {
        // The room this made may be what the open song was waiting for.
        if (unkept !== null) flush()
        return refreshSongs()
    }
    sayUnkept(null)
    const next = shelf.list().flatMap((entry) => shelf.read(entry.id) ?? [])[0]
    if (next) return show(next)
    current = null
    newSong()
}

// A song that was deleted with changes that were not kept comes back the way it was: what was
// kept of it is kept again, and it is in front with those changes, where it waits for room.
// That is opening a song, so the one in front is written first, and a jam has to be left.
export function restoreSong() {
    const record = deletedSong()
    if (!record) return
    const front = deletedFront
    if (front && jamStage() === 'jamming') return void setSongNote(`${record.name} cannot be put back in the middle of a jam. Press Leave in the Jams panel first.`)
    if ((front && !flush()) || !keepNew(record)) return
    setDeletedSong(null)
    deletedFront = null
    if (!front) return refreshSongs()
    show(front)
    flush()
}

export const listSongs = () => refreshSongs()

// A pattern's key is kept with the song, beside its code. It is a setting of that pattern's piano
// roll and not a change to the song, so it is not something to save or to go back from.
function keepKeys(keys: Record<string, Key>) {
    setPatternKeys(keys)
    if (!current) return
    current = { ...current, keys: Object.fromEntries(Object.entries(keys).map(([id, key]) => [id, writeKey(key) as string])) }
    flush()
}

export function chooseKey(id: string, key: Key | null) {
    keepKeys(key ? { ...patternKeys(), [id]: key } : without(patternKeys(), id))
}

const CODE_FILE: FileKind = { extension: 'js', label: 'Strudel code', type: 'text/javascript' }
const AUDIO_FILES: Record<Format, FileKind> = {
    wav: { extension: 'wav', label: 'WAV audio', type: 'audio/wav' },
    mp3: { extension: 'mp3', label: 'MP3 audio', type: 'audio/mpeg' },
}
const ZIP_FILE: FileKind = { extension: 'zip', label: 'Zip', type: 'application/zip' }
const EXPORT_KEY = 'weft.export'

const told = (saved: Saved, name: string) => (!saved.saved ? 'Not saved.' : saved.where ? `Saved to ${saved.where}` : `Saved as ${name}, in your downloads folder.`)
const percent = (done: number) => `${Math.round(done * 100)}%`

export function openExport() {
    setExportNote(null)
    setExportOpen(true)
}

export const closeExport = () => setExportOpen(false)
export const keptAudio = (): AudioOptions => readAudio(keeping.getItem(EXPORT_KEY))

export async function exportCode() {
    if (!current) return
    const name = fileName(current.name, CODE_FILE.extension)
    try {
        setExportNote(told(await saveFile(name, engine.getCode(), CODE_FILE), name))
    } catch (err) {
        setExportNote(`The file could not be saved: ${String((err as Error)?.message ?? err)}`)
    }
}

const SONG_KIND: FileKind = { extension: SONG_FILE, label: 'Weft Loom song', type: 'application/json' }

// The sounds of your own that the song's code names, as they go into a file. Only those are
// read from where they are kept, one at a time, in the order they are kept in.
async function soundsOfSong(code: string): Promise<PackedSound[]> {
    const used = soundsUsed(code, ownSounds().map((sound) => sound.name)).sort()
    const packed: PackedSound[] = []
    for (const name of used) {
        const sound = await ownSoundStore.get(name)
        if (sound) packed.push({ name: sound.name, file: sound.file, type: sound.type, seconds: sound.seconds, data: new Uint8Array(sound.data) })
    }
    return packed
}

// The song as one file with the sounds of your own that it uses inside it, as they are. With
// some minutes of sound in it the file is tens of megabytes, so where it goes is asked first,
// and then it is made and written a piece at a time, with a turn for the playing song between.
export async function saveSongFile() {
    if (!current || exporting()) return
    const name = fileName(current.name, SONG_KIND.extension)
    const song = { name: current.name, code: engine.getCode(), keys: current.keys ?? {}, ...(current.source ? { source: current.source } : {}) }
    setExporting(true)
    setExportNote('Choose where to save it.')
    try {
        const pieces = await savePieces(name, SONG_KIND)
        if (!pieces) return void setExportNote('Not saved.')
        setExportNote('Writing the song file.')
        const turn = turnWhenDue()
        const text = await writeSongFileInTurns({ ...song, sounds: await soundsOfSong(song.code) })
        for (const piece of textPieces(text)) {
            await turn()
            await pieces.write(piece)
        }
        await turn()
        setExportNote(told(await pieces.done(), name))
    } catch (err) {
        setExportNote(`The file could not be saved: ${String((err as Error)?.message ?? err)}`)
    } finally {
        setExporting(false)
    }
}

// The open song as the file that would be published, or why it cannot be. Making it can take
// seconds, and it is asked for when the publish window opens, when someone signs in inside it
// and when Publish is pressed. So the last one is kept beside what it was made from, and while
// none of that has changed, whoever asks gets that one, done or still being made. Your own
// sounds are a new list whenever one of them is added, cut or removed.
let readied: { from: string; sounds: ReturnType<typeof ownSounds>; made: Promise<Prepared> } | null = null

async function prepareToPublish(): Promise<Prepared | null> {
    if (!current) return null
    const song = { name: current.name, code: engine.getCode(), keys: current.keys ?? {}, ...(current.source ? { source: current.source } : {}) }
    const from = JSON.stringify(song)
    const sounds = ownSounds()
    if (readied?.from === from && readied.sounds === sounds) return readied.made
    const made = soundsOfSong(song.code).then((packed) =>
        prepareForPublishing(
            { ...song, sounds: packed },
            (bytes, sampleRate) => engine.decodeAudio(bytes.slice().buffer, sampleRate),
            (sound, kbps) => encodeMp3(sound.channels, sound.sampleRate, kbps),
        ),
    )
    readied = { from, sounds, made }
    made.catch(() => {
        if (readied?.made === made) readied = null
    })
    return made
}

const PREVIEW_SECONDS = 30

// Where the half minute people hear starts unless another bar is chosen: the first bar from
// which the most of the song plays for the whole half minute.
function busiestBar(): number {
    const length = songLengthNow()
    const filled = lanes().map((block) => readArrangement(block)?.bars ?? null)
    const playing = Array.from({ length }, (_, bar) => filled.filter((bars) => bars?.[bar]).length)
    const span = Math.min(length, Math.ceil(PREVIEW_SECONDS / ((60 * meterNow().quarters) / (song().tempo?.bpm ?? engine.bpm()))))
    let best = 0
    let most = 0
    for (let from = 0; from + span <= length; from++) {
        const heard = playing.slice(from, from + span).reduce((sum, count) => sum + count, 0)
        if (heard > most) [best, most] = [from, heard]
    }
    return best
}

const PREVIEW_KBPS = 128
const PREVIEW_RATE = 44100

const PREVIEW_PEAKS = 160

// Half a minute of the song from a bar on, as an MP3, for the site to play, with how loud it is
// along its length, for the site to draw. Null when nothing sounds in it.
async function previewToPublish(from: number, onProgress: (done: number) => void): Promise<{ mp3: Uint8Array; peaks: number[]; seconds: number } | null> {
    const perBar = engine.barSeconds()
    const bars = Math.max(from + 1, Math.min(songLengthNow(), from + Math.ceil(PREVIEW_SECONDS / perBar)))
    const made = await engine.render({ from, bars, ringSeconds: 0, sampleRate: PREVIEW_RATE }, onProgress)
    const length = Math.min(made.channels[0].length, PREVIEW_SECONDS * made.sampleRate)
    const part = made.channels.map((channel) => channel.slice(0, length))
    const peak = peakOf(part, length)
    if (!peak || length <= 0) return null
    const fade = Math.min(length, Math.round(made.sampleRate * 0.3))
    for (const channel of part) for (let at = 0; at < fade; at++) channel[length - 1 - at] *= at / fade
    const level = levelFor(peak)
    const each = Math.max(1, Math.floor(length / PREVIEW_PEAKS))
    const peaks = Array.from({ length: Math.min(PREVIEW_PEAKS, Math.ceil(length / each)) }, (_, at) => {
        let loudest = 0
        for (const channel of part) for (let sample = at * each; sample < Math.min(length, (at + 1) * each); sample++) loudest = Math.max(loudest, Math.abs(channel[sample]))
        return Math.round(Math.min(1, loudest * level) * 100) / 100
    })
    return { mp3: await encodeMp3(part, made.sampleRate, PREVIEW_KBPS, { length, level }), peaks, seconds: Math.round((length / made.sampleRate) * 10) / 10 }
}

// A published song, fetched from the site and opened like a song file. It is the site's own
// address that is asked, whatever the link said, and the song is from someone else like any
// other file, so it is only played while it is music code.
export async function openFromSite(id: string): Promise<boolean> {
    if (!/^[a-z0-9]{1,16}$/.test(id)) return false
    if (jamStage() === 'jamming') return setSongNote('A song from the site cannot be opened in the middle of a jam. Press Leave in the Jams panel first.'), false
    try {
        const answer = await fetch(`${SITE}/songs/${id}.weft`)
        if (!answer.ok) return setSongNote('That song is no longer on the site.'), false
        const text = await answer.text()
        const name = (JSON.parse(text) as { name?: unknown }).name
        return await openSongFile(new File([text], `${typeof name === 'string' && name.trim() ? name.trim() : 'Song'}.${SONG_FILE}`, { type: 'application/json' }))
    } catch {
        return setSongNote('The song could not be fetched from the site. Check that you are online, then try again.'), false
    }
}

// A sound that was made into an MP3 for a small song file starts a little late, by the silence
// an MP3 has in front. The file says where the sound started before, so that much is taken off
// again and the sound is kept as plain audio, starting where it did.
async function restored(packed: PackedSound): Promise<Pick<PackedSound, 'file' | 'type' | 'data'>> {
    if (packed.onset === undefined) return packed
    const heard = await engine.decodeAudio(packed.data.slice().buffer)
    const cut = heard ? withoutLead(heard, packed.onset) : null
    if (!cut) return packed
    return { file: packed.file.replace(/\.mp3$/i, '.wav'), type: 'audio/wav', data: await encodeWavInTurns(cut.channels, cut.sampleRate) }
}

export const dismissSongNote = () => setSongNote(null)

// A link can be pressed anywhere, on any page, and the system hands it to the app. So a link
// does not open a song: it brings the song from the site and asks. Nothing is opened, and the
// song that is open stays in front, until the person at the app says so.
export async function askFromLink(id: string) {
    if (!/^[a-z0-9]{1,16}$/.test(id)) return
    if (jamStage() === 'jamming') return void setSongNote('A link asked to open a song from the site. That cannot be done in the middle of a jam. Press Leave in the Jams panel first, then press the link again.')
    try {
        const answer = await fetch(`${SITE}/songs/${id}.weft`)
        if (!answer.ok) return void setSongNote('A link asked to open a song that is no longer on the site.')
        const text = await answer.text()
        const file = JSON.parse(text) as { name?: unknown; source?: unknown }
        setLinkAsk({ id, name: (typeof file.name === 'string' && cleanName(file.name)) || 'Song', by: readSource(file.source)?.by ?? '', text })
    } catch {
        setSongNote('A link asked to open a song, and it could not be fetched from the site. Check that you are online, then press the link again.')
    }
}

export async function openAsked() {
    const asked = linkAsk()
    if (!asked) return
    setLinkAsk(null)
    await openSongFile(new File([asked.text], `${asked.name}.${SONG_FILE}`, { type: 'application/json' }))
}

export const dropAsked = () => setLinkAsk(null)

// The kinds of file a song is opened from.
export const SONG_KINDS = [SONG_FILE, 'js', 'strudel', 'txt']

// Open a File in the desktop app's menu. In the window the same is a button, which opens the
// window's own file chooser.
export async function openAFile() {
    if (jamStage() === 'jamming') return
    try {
        const file = await chooseFile('Songs', SONG_KINDS)
        if (file) await openSongFile(file)
    } catch (err) {
        setSongNote(`The file could not be opened: ${String((err as Error)?.message ?? err)}`)
    }
}

// A song file, or any file of code, becomes a new song. The sounds that come in a song file are
// added to yours. One whose name is already yours is taken to be the same sound; one whose name
// belongs to another sound gets a new name, in the song's code as well.
export async function openSongFile(file: File): Promise<boolean> {
    try {
        const read = readSongFile(await file.text(), file.name)
        if (!read) return setSongNote(`${file.name} is not a song this app can read.`), false
        let code = read.code
        let added = 0
        // What is asked is what is kept, not what happens to be loaded at this moment: a file
        // opened while the app is still starting must not write over a sound of yours.
        const stored = new Set(await ownSoundStore.names())
        for (const packed of read.sounds) {
            if (!SOUND_NAME.test(packed.name) || stored.has(packed.name)) continue
            const name = soundNameFor(packed.name, (wanted) => engine.soundTaken(wanted) || stored.has(wanted) || !fitSoundName(wanted))
            stored.add(name)
            if (name !== packed.name) code = renameSound(code, packed.name, name)
            const back = await restored(packed)
            const data = back.data.buffer.slice(back.data.byteOffset, back.data.byteOffset + back.data.byteLength) as ArrayBuffer
            const sound: OwnSound = { name, file: back.file, seconds: packed.seconds, addedAt: Date.now(), type: back.type, data }
            await ownSoundStore.put(sound)
            await register(sound)
            setOwnSounds([...ownSounds(), infoOfSound(sound)].sort(byName))
            added++
        }
        if (!flush()) return false
        const record: SongRecord = { id: newId(), name: freeTitle(cleanName(read.name) || UNTITLED, titles()), saved: code, draft: code, changedAt: Date.now(), guarded: true, ...(Object.keys(read.keys).length ? { keys: read.keys } : {}), ...(read.source ? { source: read.source } : {}) }
        if (!keepNew(record)) return false
        show(record)
        setSongNote(added ? `Opened ${record.name}, with ${added} ${added === 1 ? 'sound' : 'sounds'} of its own, now among yours.` : `Opened ${record.name}.`)
        return true
    } catch (err) {
        setSongNote(`${file.name} could not be opened: ${String((err as Error)?.message ?? err)}`)
        return false
    }
}

// The song from its first bar to its last, with what still rings after it, as an audio file.
export async function exportAudio(options: AudioOptions) {
    if (!current || exporting()) return
    if (engineState().sounds !== 'ready') return void setExportNote('The sounds are still loading. Try again in a moment.')
    keeping.setItem(EXPORT_KEY, JSON.stringify(options))
    const kind = AUDIO_FILES[options.format]
    const grade = gradeOf(options)
    const name = fileName(current.name, kind.extension)
    const bars = songLengthNow()
    setExporting(true)
    setExportNote('Making the audio, 0%.')
    try {
        const made = await engine.render({ bars, ringSeconds: RING_SECONDS, sampleRate: grade.sampleRate }, (done) => setExportNote(`Making the audio, ${percent(done)}.`))
        const whole = Math.min(made.channels[0].length, Math.round(made.seconds * made.sampleRate))
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

// The patterns that would each get a file: the ones that are not switched off.
export const patternsToExport = (): string[] => song().patterns.filter((block) => !block.muted).map((block) => block.id)

// Every pattern of the song as an audio file of its own, in one zip, for finishing the song
// somewhere else. Each file is as long as the song and as loud as the pattern is in it, with
// what the other patterns do to it left in, so that laid over each other they are the song
// again. Only reverb and noise differ, as they do between any two recordings of one song:
// Strudel makes both anew every time.
export async function exportPatterns(options: AudioOptions) {
    if (!current || exporting()) return
    if (engineState().sounds !== 'ready') return void setExportNote('The sounds are still loading. Try again in a moment.')
    keeping.setItem(EXPORT_KEY, JSON.stringify(options))
    const kind = AUDIO_FILES[options.format]
    const grade = gradeOf(options)
    const title = current.name
    const name = fileName(`${title} patterns`, ZIP_FILE.extension)
    const bars = songLengthNow()
    const ids = patternsToExport()
    if (!ids.length) return void setExportNote('No pattern of this song plays, so there is nothing to save.')
    if (ids.length * sizeOf(options, songSeconds(bars) + RING_SECONDS) > ZIP_LIMIT) return void setExportNote('That is more than one zip can hold. Choose MP3 or a lower quality, then export again.')
    setExporting(true)
    setExportNote('Choose where to save it.')
    let begun = false
    try {
        const pieces = await savePieces(name, ZIP_FILE)
        if (!pieces) return void setExportNote('Not saved.')
        // The whole song is made first, only to learn how long it sounds and how far it has
        // to be turned down to fit. Every pattern is then cut and turned down by the same.
        setExportNote('Listening to the whole song first, 0%.')
        // Its length, its level and what it could not load are all that is kept of it. The
        // sound itself is let go before the patterns are made, each of which is as large again.
        const { length, peak, missed } = await engine
            .render({ bars, ringSeconds: RING_SECONDS, sampleRate: grade.sampleRate }, (done) => setExportNote(`Listening to the whole song first, ${percent(done)}.`))
            .then((whole) => {
                const length = soundingLength(whole.channels, whole.sampleRate, Math.min(whole.channels[0].length, Math.round(whole.seconds * whole.sampleRate)))
                return { length, peak: peakOf(whole.channels, length), missed: whole.missed }
            })
        if (!peak) return void setExportNote('Nothing sounds in this song, so there is no audio to save.')
        const level = levelFor(peak)
        const zip = zipWriter()
        let kept = 0
        for (const [at, id] of ids.entries()) {
            const said = `Making ${id}, ${at + 1} of ${ids.length}`
            setExportNote(`${said}, 0%.`)
            const made = await engine.render({ bars, ringSeconds: RING_SECONDS, sampleRate: grade.sampleRate, only: id }, (done) => setExportNote(`${said}, ${percent(done)}.`))
            const cut = Math.min(length, made.channels[0].length)
            if (!peakOf(made.channels, cut)) continue
            const bytes = grade.kbps ? await encodeMp3(made.channels, made.sampleRate, grade.kbps, { length: cut, level }) : encodeWav(made.channels, made.sampleRate, { length: cut, level, depth: grade.depth })
            for (const piece of zip.add(fileName(`${title} - ${id}`, kind.extension), bytes)) {
                await pieces.write(piece)
                begun = true
            }
            kept++
        }
        await pieces.write(zip.end())
        const saved = await pieces.done()
        const quiet = ids.length - kept
        const left = quiet ? ` ${quiet} that never ${quiet === 1 ? 'sounds was' : 'sound were'} left out.` : ''
        const missing = missed ? ` ${missed} ${missed === 1 ? 'sound' : 'sounds'} could not be loaded and ${missed === 1 ? 'is' : 'are'} missing from it.` : ''
        setExportNote(`${told(saved, name)} ${kept} ${kept === 1 ? 'pattern' : 'patterns'} in it.${left}${missing}`)
    } catch (err) {
        const why = String((err as Error)?.message ?? err)
        setExportNote(begun ? `The patterns could not all be made: ${why} The zip that was begun is not whole. Delete it and export again.` : `The patterns could not be made: ${why}`)
    } finally {
        setExporting(false)
    }
}
