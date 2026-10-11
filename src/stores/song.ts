import { createSignal } from 'solid-js'
import { DEFAULT_MIX, type Mix } from '../library/mix'
import type { EngineState } from '../engine/engine'
import type { SongInfo, SongRecord } from '../library/shelf'
import type { ViewMode } from '../library/layout'
import type { OwnSoundInfo } from '../library/sounds'
import type { Key } from '../song/scales'
import type { Song } from '../song/types'
import type { SoundItem } from '../sounds/catalog'

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
export const [cycle, setCycle] = createSignal(0)
export const [beat, setBeat] = createSignal(0)
export const [position, setPosition] = createSignal(0)
export const [bpm, setBpm] = createSignal(120)
export const [revision, setRevision] = createSignal(0)
export const [openPanel, setOpenPanel] = createSignal<string | null>(null)
export const [unfolded, setUnfolded] = createSignal<string[]>([])
export const [mixNow, setMixNow] = createSignal<Mix>(DEFAULT_MIX)
export const [mixerOpen, setMixerOpen] = createSignal(false)
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
// Whether the open song is one that is only played while all of it is music code.
export const [songGuarded, setSongGuarded] = createSignal(false)
// The key each pattern's piano roll keeps to, by the pattern's name.
export const [patternKeys, setPatternKeys] = createSignal<Record<string, Key>>({})
// Bars that go round while the song plays: from `from` up to, not including, `to`.
export const [loopBars, setLoopBars] = createSignal<{ from: number; to: number } | null>(null)
export const [exporting, setExporting] = createSignal(false)
export const [exportOpen, setExportOpen] = createSignal(false)
export const [ownSounds, setOwnSounds] = createSignal<OwnSoundInfo[]>([])
export const [ownSoundNote, setOwnSoundNote] = createSignal<string | null>(null)
// When a take from the microphone was started, while one is being made.
export const [takeSince, setTakeSince] = createSignal<number | null>(null)
export const [draggedSound, setDraggedSound] = createSignal<SoundItem | null>(null)
export const [exportNote, setExportNote] = createSignal<string | null>(null)
export const [songNote, setSongNote] = createSignal<string | null>(null)
