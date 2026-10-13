import { createSignal } from 'solid-js'
import { fromUnit } from '../controls/catalog'
import { keeping } from '../library/kept'
import { knobAsItStands, replayHeld, turnControl } from './controller'

// The knobs and faders of a MIDI controller turn knobs of the app. Which turns which is learnt:
// with learning on, a knob of the app is pressed and then one of the controller is turned, and
// from then on the second turns the first. A knob of the app is known by its pattern and by
// what it is, so the same controller knob is the cutoff of the bass in every song that has a
// bass with a cutoff.
export type Bound = { id: string; fn: string; label: string }
type Bindings = Record<string, Bound>

const KEY = 'weft.midi.knobs'

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

const [bindings, setBindings] = createSignal<Bindings>(read())
// Null while nothing is being learnt. Else the knob of the app that waits for one of the
// controller, or `picking` while one of the app is still to be pressed.
const [learning, setLearning] = createSignal<Bound | 'picking' | null>(null)
const [learnt, setLearnt] = createSignal<string | null>(null)

export { bindings, learning, learnt }

function keep(next: Bindings) {
    setBindings(next)
    try {
        keeping.setItem(KEY, JSON.stringify(next))
    } catch {
        // Not kept: the knobs still hold until the app is closed.
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

// What a controller knob is called: its number, and its channel when that is not the first.
export const knobName = (from: string): string => {
    const [channel, number] = from.split(':').map(Number)
    return `knob ${number}${channel ? `, channel ${channel + 1}` : ''}`
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

// Gives back whether what the controller sent was a knob, so that nothing else is done with it.
export function knobHeard(bytes: Uint8Array): boolean {
    if (bytes.length < 3 || (bytes[0] & 0xf0) !== 0xb0) return false
    const from = `${bytes[0] & 0x0f}:${bytes[1] & 0x7f}`
    const wanted = learning()
    if (wanted && wanted !== 'picking') {
        // A knob of the app has one knob of the controller, and the other way round.
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
