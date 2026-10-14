import { createSignal } from 'solid-js'
import type { LeftPanel } from '../library/layout'
import { DEFAULT_MIX, type Mix } from '../library/mix'
import type { EngineState } from '../engine/engine'
import type { SongInfo, SongRecord } from '../library/shelf'
import type { ViewMode } from '../library/layout'
import type { PackInfo } from '../library/packs'
import type { SoundChoice } from '../library/soundDevices'
import type { OwnSoundInfo } from '../library/sounds'
import type { Key } from '../song/scales'
import type { ChordLane } from '../song/chords'
import { USUAL, type Meter } from '../song/meter'
import type { TempoLane } from '../song/tempo'
import type { Song } from '../song/types'
import type { SoundItem } from '../sounds/catalog'
import type { Preset } from '../sounds/presets'

export type { ViewMode } from '../library/layout'

export const [song, setSong] = createSignal<Song>({ patterns: [], tempo: null, tempoLocked: false, insertAt: 0, error: null })
export const [stale, setStale] = createSignal(false)
export const [engineState, setEngineState] = createSignal<EngineState>({ playing: false, paused: false, dirty: false, error: null, sounds: 'loading' })
export const [selected, setSelected] = createSignal<string | null>(null)
export const [viewMode, setViewMode] = createSignal<ViewMode>('both')
// Song follows the bars filled in the Song panel. Live lets every pattern go round, as if no
// bars had been written.
export type PlayMode = 'song' | 'live'
export const [playMode, setPlayModeValue] = createSignal<PlayMode>('song')
export const [waveShown, setWaveShown] = createSignal(true)
export const [songShown, setSongShown] = createSignal(true)
export const [soundsWidth, setSoundsWidth] = createSignal<number | null>(null)
export const [codeWidth, setCodeWidth] = createSignal<number | null>(null)
export const [soloIds, setSoloIds] = createSignal<string[]>([])
// The chord of every bar, where the song has chords for its patterns to follow.
export const [chordLane, setChordLane] = createSignal<ChordLane | null>(null, { equals: (a, b) => a === b || (a !== null && b !== null && a.from === b.from && a.to === b.to && a.values.join(' ') === b.values.join(' ')) })
// How the song's bar is counted.
export const [meter, setMeter] = createSignal<Meter>(USUAL)
// The tempo of every bar, where the tempo changes along the song.
export const [tempoLane, setTempoLane] = createSignal<TempoLane | null>(null, { equals: (a, b) => a === b || (a !== null && b !== null && a.from === b.from && a.to === b.to && a.values.length === b.values.length && a.values.every((bpm, at) => bpm === b.values[at])) })
export const [cycle, setCycle] = createSignal(0)
export const [beat, setBeat] = createSignal(0)
// The metronome and the count-in, as they are switched, and the beat of the bar of clicks a song
// is being counted in with. Null when it is not being counted in.
export const [clickOn, setClickOn] = createSignal(false)
export const [countInOn, setCountInOn] = createSignal(false)
export const [countBeat, setCountBeat] = createSignal<number | null>(null)
export const [position, setPosition] = createSignal(0)
export const [bpm, setBpm] = createSignal(120)
export const [revision, setRevision] = createSignal(0)
export const [openPanel, setOpenPanel] = createSignal<string | null>(null)
export const [unfolded, setUnfolded] = createSignal<string[]>([])
export const [mixNow, setMixNow] = createSignal<Mix>(DEFAULT_MIX)
export const [mixerOpen, setMixerOpen] = createSignal(false)
// The panels of the left column that are folded to their heading.
export const [folded, setFolded] = createSignal<LeftPanel[]>([])
export const [gridNotes, setGridNotes] = createSignal<Record<string, boolean>>({})
export const [rollRanges, setRollRanges] = createSignal<Record<string, { low: number; high: number }>>({})
export const [soundsOpen, setSoundsOpen] = createSignal(false)
export const [songBars, setSongBars] = createSignal(16)
export const [startBar, setStartBar] = createSignal(0)

export type Removed = { id: string; index: number; from: number; text: string; after: string }
export const [removed, setRemoved] = createSignal<Removed | null>(null)
export const [songs, setSongs] = createSignal<SongInfo[]>([])
export const [currentSong, setCurrentSong] = createSignal<SongInfo | null>(null)
export const [deletedSong, setDeletedSong] = createSignal<SongRecord | null>(null)
// The start screen: what the app opens with, over everything else.
export const [startOpen, setStartOpen] = createSignal(false)
// A song with changes since it was saved is being closed, and the question is whether to save.
export const [closingSong, setClosingSong] = createSignal(false)
// The sound settings: whether their window is open, and what was chosen in them.
export const [soundOpen, setSoundOpen] = createSignal(false)
export const [soundChoice, setSoundChoice] = createSignal<SoundChoice>({ input: null, output: null, outputName: null, clock: { kind: 'off' } })
// Whether the open song is one that is only played while all of it is music code.
export const [songGuarded, setSongGuarded] = createSignal(false)
// The key each pattern's piano roll keeps to, by the pattern's name.
export const [patternKeys, setPatternKeys] = createSignal<Record<string, Key>>({})
// The pattern that is played from the computer's keyboard, the octave its first key is in, and
// whether what is played while the song plays is written into the pattern.
export const [pianoFor, setPianoFor] = createSignal<string | null>(null)
export const [pianoOctave, setPianoOctave] = createSignal(3)
export const [pianoWrites, setPianoWrites] = createSignal(true)
// The MIDI keyboards that are plugged in, by name. Null while the app is not listening for any.
export const [midiKeyboards, setMidiKeyboards] = createSignal<string[] | null>(null)
// For the patterns that have versions, which one is in sight. The first when nothing is said.
export const [shownVariants, setShownVariants] = createSignal<Record<string, number>>({})
// The scene that was chosen while the song plays and waits for the next bar to begin.
export const [sceneWaiting, setSceneWaiting] = createSignal<string | null>(null)
// Whether a knob that is turned while the song plays is taken down, to be drawn over the song.
export const [takingKnobs, setTakingKnobs] = createSignal(false)
// Bars that go round while the song plays: from `from` up to, not including, `to`.
export const [loopBars, setLoopBars] = createSignal<{ from: number; to: number } | null>(null)
export const [exporting, setExporting] = createSignal(false)
export const [exportOpen, setExportOpen] = createSignal(false)
// A sound of your own that is being cut shorter: how long it is, its outline, and the stretch
// of it, in seconds, that will be kept.
export type Trim = { name: string; seconds: number; peaks: number[]; from: number; to: number }
export const [trim, setTrim] = createSignal<Trim | null>(null)
export const [ownSounds, setOwnSounds] = createSignal<OwnSoundInfo[]>([])
export const [ownSoundNote, setOwnSoundNote] = createSignal<string | null>(null)
// The packs that were added: who made each and what it holds.
export const [packs, setPacks] = createSignal<PackInfo[]>([])
export const [packNote, setPackNote] = createSignal<string | null>(null)
// The presets you saved. The ones the app comes with are not among them.
export const [ownPresets, setOwnPresets] = createSignal<Preset[]>([])
// When a take from the microphone was started, while one is being made.
export const [takeSince, setTakeSince] = createSignal<number | null>(null)
// Whether the microphone is being opened for a take. One can take seconds to answer.
export const [takeOpening, setTakeOpening] = createSignal(false)
export const [draggedSound, setDraggedSound] = createSignal<SoundItem | null>(null)
export const [exportNote, setExportNote] = createSignal<string | null>(null)
export const [songNote, setSongNote] = createSignal<string | null>(null)
// A song that a link asked the app to open, held until its owner says whether to.
export const [linkAsk, setLinkAsk] = createSignal<{ id: string; name: string; by: string; text: string } | null>(null)
