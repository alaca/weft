import { createSignal } from 'solid-js'
import type { EngineState } from '../engine/engine'
import type { SongInfo, SongRecord } from '../library/shelf'
import type { Song } from '../song/types'

export type ViewMode = 'controls' | 'both' | 'code'

export const [song, setSong] = createSignal<Song>({ patterns: [], tempo: null, tempoLocked: false, insertAt: 0, error: null })
export const [stale, setStale] = createSignal(false)
export const [engineState, setEngineState] = createSignal<EngineState>({ playing: false, paused: false, dirty: false, error: null, sounds: 'loading' })
export const [selected, setSelected] = createSignal<string | null>(null)
export const [viewMode, setViewMode] = createSignal<ViewMode>('both')
export const [soloIds, setSoloIds] = createSignal<string[]>([])
export const [cycle, setCycle] = createSignal(0)
export const [beat, setBeat] = createSignal(0)
export const [position, setPosition] = createSignal(0)
export const [bpm, setBpm] = createSignal(120)
export const [revision, setRevision] = createSignal(0)
export const [openPanel, setOpenPanel] = createSignal<string | null>(null)
export const [unfolded, setUnfolded] = createSignal<string[]>([])
export const [masterVolume, setMasterVolumeValue] = createSignal(1)
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
export const [openDemoId, setOpenDemoId] = createSignal<string | null>(null)
