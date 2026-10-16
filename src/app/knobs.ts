import { createSignal } from 'solid-js'
import { fromUnit } from '../controls/catalog'
import { keeping } from '../library/kept'
import { codeNow, chooseScene, knobAsItStands, replayHeld, scenesOf, toggleMute, toggleSolo, turnControl } from './controller'
import { song } from '../stores/song'

// The knobs and faders of a MIDI controller turn knobs of the app. Which turns which is learnt:
// with learning on, a knob of the app is pressed and then one of the controller is turned, and
// from then on the second turns the first. A knob of the app is known by its pattern and by
// what it is, so the same controller knob is the cutoff of the bass in every song that has a
// bass with a cutoff.
//
// Its pads and buttons switch scenes, and mute or solo a pattern, learnt the same way: a scene,
// or the M or S of a pattern, is pressed in the app, then a pad of the controller. A scene is
// known by its name and a pattern by its name in the code, so a pad does the same in every song
// that has them.
export type Bound = { id: string; fn: string; label: string }
export type PadTarget = { kind: 'scene'; name: string; label: string } | { kind: 'mute' | 'solo'; id: string; label: string }
type Pads = Record<string, PadTarget>
type Bindings = Record<string, Bound>

const KEY = 'weft.midi.knobs'
const PADS_KEY = 'weft.midi.pads'

function read(): Bindings {
    try {
        const kept = JSON.parse(keeping.getItem(KEY) ?? '{}') as unknown
        if (!kept || typeof kept !== 'object') return {}
        return Object.fromEntries(
            Object.entries(kept as Record<string, Partial<Bound>>).flatMap(([from, to]) =>
                /^\d{1,2}:\d{1,3}$/.test(from) && typeof to?.id === 'string' && typeof to.fn === 'string' ? [[from, { id: to.id, fn: to.fn, label: typeof to.label === 'string' ? to.label : `${to.fn} of ${to.id}` }]] : [],
            ),
        )
    } catch {
        return {}
    }
}

// A pad is known by what it sends: a note, n:channel:note, or a button that sends a control
// change, c:channel:number.
function readPads(): Pads {
    try {
        const kept = JSON.parse(keeping.getItem(PADS_KEY) ?? '{}') as unknown
        if (!kept || typeof kept !== 'object') return {}
        return Object.fromEntries(
            Object.entries(kept as Record<string, { kind?: unknown; name?: unknown; id?: unknown; label?: unknown }>).flatMap(([from, to]): [string, PadTarget][] => {
                if (!/^[nc]:\d{1,2}:\d{1,3}$/.test(from) || typeof to?.label !== 'string') return []
                if (to.kind === 'scene' && typeof to.name === 'string') return [[from, { kind: 'scene', name: to.name, label: to.label }]]
                if ((to.kind === 'mute' || to.kind === 'solo') && typeof to.id === 'string') return [[from, { kind: to.kind, id: to.id, label: to.label }]]
                return []
            }),
        )
    } catch {
        return {}
    }
}

const [bindings, setBindings] = createSignal<Bindings>(read())
const [pads, setPads] = createSignal<Pads>(readPads())
// Null while nothing is being learnt. Else the knob, scene or button of the app that waits for
// one of the controller, or `picking` while one of the app is still to be pressed.
const [learning, setLearning] = createSignal<Bound | PadTarget | 'picking' | null>(null)
const [learnt, setLearnt] = createSignal<string | null>(null)

export { bindings, learning, learnt, pads }

export const isPad = (wanted: Bound | PadTarget | 'picking' | null): wanted is PadTarget => typeof wanted === 'object' && wanted !== null && 'kind' in wanted

function keep(next: Bindings) {
    setBindings(next)
    try {
        keeping.setItem(KEY, JSON.stringify(next))
    } catch {
        // Not kept: the knobs still hold until the app is closed.
    }
}

function keepPads(next: Pads) {
    setPads(next)
    try {
        keeping.setItem(PADS_KEY, JSON.stringify(next))
    } catch {
        // Not kept: the pads still hold until the app is closed.
    }
}

export function learnKnobs(on: boolean) {
    setLearnt(null)
    setLearning(on ? 'picking' : null)
}

// A knob of the app was pressed while learning: it is the one that waits.
export function pickKnob(knob: Bound) {
    if (learning() === null) return
    setLearnt(null)
    setLearning(knob)
}

export const forgetKnob = (from: string) => keep(Object.fromEntries(Object.entries(bindings()).filter(([other]) => other !== from)))
export const forgetPad = (from: string) => keepPads(Object.fromEntries(Object.entries(pads()).filter(([other]) => other !== from)))

// A scene, or the M or S of a pattern, was pressed while learning: it is the one that waits, and
// is not switched. Gives back whether it was, so that otherwise the press does what it does.
function pickPad(target: PadTarget): boolean {
    if (learning() === null) return false
    setLearnt(null)
    setLearning(target)
    return true
}

export const sceneOrLearn = (name: string) => void (pickPad({ kind: 'scene', name, label: `the scene ${name}` }) || chooseScene(name))
export const muteOrLearn = (id: string) => void (pickPad({ kind: 'mute', id, label: `Mute ${id}` }) || toggleMute(id))
export const soloOrLearn = (id: string) => void (pickPad({ kind: 'solo', id, label: `Solo ${id}` }) || toggleSolo(id))

// What a controller knob is called: its number, and its channel when that is not the first.
export const knobName = (from: string): string => {
    const [channel, number] = from.split(':').map(Number)
    return `knob ${number}${channel ? `, channel ${channel + 1}` : ''}`
}

// What a pad of the controller is called: the note it sends or the number of its button, and its
// channel when that is not the first.
export const padName = (from: string): string => {
    const [kind, channel, number] = from.split(':')
    return `${kind === 'n' ? 'pad' : 'button'} ${number}${Number(channel) ? `, channel ${Number(channel) + 1}` : ''}`
}

export const boundTo = (id: string, fn: string): string | null => Object.entries(bindings()).find(([, to]) => to.id === id && to.fn === fn)?.[0] ?? null

// A controller sends many values a second while a knob is turned. Each bound knob is moved once
// a frame, to the last value that came, and what a turn holds back is played when it has rested.
const waiting = new Map<string, number>()
let frame = 0
let rest = 0
function apply() {
    frame = 0
    for (const [from, unit] of waiting) {
        const to = bindings()[from]
        const knob = to ? knobAsItStands(to.id, to.fn) : null
        if (to && knob) turnControl(to.id, to.fn, fromUnit(unit, knob.min, knob.max, knob.scale))
    }
    waiting.clear()
    window.clearTimeout(rest)
    rest = window.setTimeout(replayHeld, 180)
}

function press(to: PadTarget) {
    if (to.kind === 'scene') {
        if (scenesOf(codeNow()).some((scene) => scene.name === to.name)) chooseScene(to.name)
    } else if (song().patterns.some((pattern) => pattern.id === to.id)) (to.kind === 'mute' ? toggleMute : toggleSolo)(to.id)
}

// Gives back whether what the controller sent was a pad that is learnt or being learnt, so that
// nothing else is done with it. A pad does its work when it is pressed, not when it is let go.
export function padHeard(bytes: Uint8Array): boolean {
    if (bytes.length < 3) return false
    const kind = bytes[0] & 0xf0
    const channel = bytes[0] & 0x0f
    if (kind !== 0x90 && kind !== 0x80 && kind !== 0xb0) return false
    const from = `${kind === 0xb0 ? 'c' : 'n'}:${channel}:${bytes[1] & 0x7f}`
    const down = kind !== 0x80 && (bytes[2] & 0x7f) > 0
    const wanted = learning()
    if (isPad(wanted)) {
        if (!down) return true
        const same = (to: PadTarget) => to.kind === wanted.kind && (to.kind === 'scene' ? wanted.kind === 'scene' && to.name === wanted.name : wanted.kind !== 'scene' && to.id === wanted.id)
        keepPads({ ...Object.fromEntries(Object.entries(pads()).filter(([other, to]) => other !== from && !same(to))), [from]: wanted })
        if (kind === 0xb0) forgetKnob(`${channel}:${bytes[1] & 0x7f}`)
        setLearnt(`${wanted.label[0].toUpperCase()}${wanted.label.slice(1)} is pressed by ${padName(from)}.`)
        setLearning('picking')
        return true
    }
    if (wanted !== null) return false
    const to = pads()[from]
    if (!to) return false
    if (down) press(to)
    return true
}

// Gives back whether what the controller sent was a knob, so that nothing else is done with it.
export function knobHeard(bytes: Uint8Array): boolean {
    if (bytes.length < 3 || (bytes[0] & 0xf0) !== 0xb0) return false
    const from = `${bytes[0] & 0x0f}:${bytes[1] & 0x7f}`
    const wanted = learning()
    if (wanted && wanted !== 'picking' && !isPad(wanted)) {
        // A knob of the app has one knob of the controller, and the other way round.
        forgetPad(`c:${from}`)
        keep({ ...Object.fromEntries(Object.entries(bindings()).filter(([other, to]) => other !== from && !(to.id === wanted.id && to.fn === wanted.fn))), [from]: wanted })
        setLearnt(`${wanted.label} is turned by ${knobName(from)}.`)
        setLearning('picking')
        return true
    }
    if (!bindings()[from]) return true
    waiting.set(from, (bytes[2] & 0x7f) / 127)
    frame ||= requestAnimationFrame(apply)
    return true
}
