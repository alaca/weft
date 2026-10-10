import { batch, createEffect, createRoot } from 'solid-js'
import { findDef, writeNumber } from '../controls/catalog'
import { callFor } from '../controls/views'
import { createEngine } from '../engine/engine'
import { analyze } from '../song/analyze'
import { addCall, removeCall, setNumber, toggleMute as muteEdit } from '../song/edits'
import { STARTER } from '../song/starter'
import type { PatternEvent } from '../song/types'
import {
    engineState,
    openPanel,
    selected,
    setBeat,
    setBpm,
    setCycle,
    setEngineState,
    setOpenPanel,
    setPosition,
    setRevision,
    setSelected,
    setSoloIds,
    setSong,
    setStale,
    soloIds,
    song,
    stale,
} from '../stores/song'

const STORAGE_KEY = 'weft.song'
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
    if (engineState().playing) play()
}

export function toggleSolo(id: string) {
    const next = soloIds().includes(id) ? soloIds().filter((other) => other !== id) : [...soloIds(), id]
    setSoloIds(next)
    engine.setSolo(next)
}

export const eventsOf = (id: string, whichCycle: number): PatternEvent[] => engine.events(id, whichCycle)

let evaluateTimer: number | undefined

function scheduleEvaluate() {
    if (!engineState().playing || evaluateTimer !== undefined) return
    evaluateTimer = window.setTimeout(() => {
        evaluateTimer = undefined
        play()
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
    if (engineState().playing) play()
}

export function removeControl(id: string, fn: string) {
    const block = find(id)
    const call = block ? callFor(block, fn) : undefined
    if (!call || stale()) return
    engine.applyEdit(removeCall(call))
    if (engineState().playing) play()
}

export function setVolume(id: string, value: number) {
    const block = find(id)
    if (!block) return
    if (callFor(block, 'gain')) setControl(id, 'gain', value)
    else addControl(id, 'gain', value)
}

export const togglePanel = (id: string) => setOpenPanel(openPanel() === id ? null : id)
