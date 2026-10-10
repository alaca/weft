import { createSignal } from 'solid-js'
import type { EngineState } from '../engine/engine'
import type { Song } from '../song/types'

export type ViewMode = 'controls' | 'both' | 'code'

export const [song, setSong] = createSignal<Song>({ patterns: [], error: null })
export const [stale, setStale] = createSignal(false)
export const [engineState, setEngineState] = createSignal<EngineState>({ playing: false, dirty: false, error: null, sounds: 'loading' })
export const [selected, setSelected] = createSignal<string | null>(null)
export const [viewMode, setViewMode] = createSignal<ViewMode>('both')
export const [soloIds, setSoloIds] = createSignal<string[]>([])
export const [cycle, setCycle] = createSignal(0)
export const [beat, setBeat] = createSignal(0)
export const [position, setPosition] = createSignal(0)
export const [bpm, setBpm] = createSignal(120)
export const [revision, setRevision] = createSignal(0)
export const [openPanel, setOpenPanel] = createSignal<string | null>(null)
