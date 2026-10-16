import { addCall, removeCall } from './edits'
import type { Meter } from './meter'
import type { Call, PatternBlock, TextEdit } from './types'

// Ways to vary a pattern without writing code. Each is one call of Strudel's at the end of the
// pattern, and is read back from there, so a variation typed by hand shows in the menu too:
//
//   .lastOf(4, fast(2))    every 4th bar, twice as fast
//   .late(0.0625)          a sixteenth later
//   .rev()                 backwards
//   .iter(4)               each bar starts a beat further on
//   .off(0.125, mul(gain(0.5)))   a quieter copy an eighth later
//   .struct("t(5,8)")      the notes spread evenly, five in eight
//
// What the pattern plays is still drawn as it is written: a variation lies over it, as an
// effect does.

export type Kind = 'every' | 'shift' | 'backwards' | 'turn' | 'echo' | 'spread'

export type Change = 'faster' | 'twice' | 'backwards' | 'fewer' | 'octave'

export const CHANGES: { id: Change; label: string; text: string; notesOnly?: boolean }[] = [
    { id: 'faster', label: 'Twice as fast', text: 'fast(2)' },
    { id: 'twice', label: 'Each hit twice', text: 'ply(2)' },
    { id: 'backwards', label: 'Backwards', text: 'rev' },
    { id: 'fewer', label: 'Half the hits', text: 'degrade' },
    { id: 'octave', label: 'An octave up', text: 'add(note(12))', notesOnly: true },
]

export const EVERY_BARS = [2, 4, 8]
export const SHIFTS = [-1, 1, 2]
export const ECHOES = [1, 2]
export const SPREADS: [number, number][] = [
    [3, 8],
    [5, 8],
    [5, 16],
    [7, 16],
]

// An echo of notes is an octave up, as is usual for a melody; an echo of drums is quieter.
const ECHO_OF_NOTES = 'add(note(12))'
const ECHO_OF_DRUMS = 'mul(gain(0.5))'

export type Varied = {
    every: { bars: number; change: Change } | null
    // In sixteenth notes, later when above 0.
    shift: number | null
    backwards: boolean
    // How many parts a bar is turned by, one part further each bar.
    turn: number | null
    // How many sixteenths later the copy comes.
    echo: number | null
    spread: [number, number] | null
}

export type Value<K extends Kind> = Varied[K]

const plain = (text: string) => text.replace(/\s+/g, '')
const sixteenth = (meter: Meter) => 1 / (meter.quarters * 4)
const round = (value: number) => String(Number(value.toFixed(4)))

type Found = { kind: Kind; call: Call; value: unknown }

function readCall(code: string, call: Call, meter: Meter): Found | null {
    const [first, second] = call.args
    const number = first?.kind === 'number' ? first.value : null
    if (call.name === 'lastOf' && number !== null && second && call.args.length === 2) {
        const text = plain(code.slice(second.from, second.to))
        const change = CHANGES.find((each) => plain(each.text) === text)
        return change && EVERY_BARS.includes(number) ? { kind: 'every', call, value: { bars: number, change: change.id } } : null
    }
    if ((call.name === 'late' || call.name === 'early') && number !== null && call.args.length === 1) {
        const steps = Number(((number / sixteenth(meter)) * (call.name === 'late' ? 1 : -1)).toFixed(2))
        return { kind: 'shift', call, value: steps }
    }
    if (call.name === 'rev' && !call.args.length) return { kind: 'backwards', call, value: true }
    if (call.name === 'iter' && number !== null && call.args.length === 1) return { kind: 'turn', call, value: number }
    if (call.name === 'off' && number !== null && second && call.args.length === 2) {
        const text = plain(code.slice(second.from, second.to))
        if (text !== plain(ECHO_OF_NOTES) && text !== plain(ECHO_OF_DRUMS)) return null
        return { kind: 'echo', call, value: Number((number / sixteenth(meter)).toFixed(2)) }
    }
    if (call.name === 'struct' && first?.kind === 'string' && call.args.length === 1) {
        const even = /^\s*t\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*$/.exec(first.value)
        return even ? { kind: 'spread', call, value: [Number(even[1]), Number(even[2])] } : null
    }
    return null
}

// The calls of the pattern that are variations, the first of each kind.
function found(code: string, block: PatternBlock, meter: Meter): Map<Kind, Found> {
    const all = new Map<Kind, Found>()
    for (const call of block.calls.slice(1)) {
        const one = readCall(code, call, meter)
        if (one && !all.has(one.kind)) all.set(one.kind, one)
    }
    return all
}

export function readVaried(code: string, block: PatternBlock, meter: Meter): Varied {
    const all = found(code, block, meter)
    const value = <K extends Kind>(kind: K, none: Value<K>): Value<K> => (all.get(kind)?.value as Value<K>) ?? none
    return {
        every: value('every', null),
        shift: value('shift', null),
        backwards: value('backwards', false),
        turn: value('turn', null),
        echo: value('echo', null),
        spread: value('spread', null),
    }
}

export const variedCount = (varied: Varied): number => Object.values(varied).filter((value) => value !== null && value !== false).length

function callText<K extends Kind>(kind: K, value: Value<K>, meter: Meter, notes: boolean): string | null {
    if (value === null || value === false) return null
    switch (kind) {
        case 'every': {
            const every = value as Varied['every'] & object
            const change = CHANGES.find((each) => each.id === every.change)
            return change ? `lastOf(${every.bars}, ${change.text})` : null
        }
        case 'shift': {
            const steps = value as number
            return steps ? `${steps > 0 ? 'late' : 'early'}(${round(Math.abs(steps) * sixteenth(meter))})` : null
        }
        case 'backwards':
            return 'rev()'
        case 'turn':
            return `iter(${value as number})`
        case 'echo':
            return `off(${round((value as number) * sixteenth(meter))}, ${notes ? ECHO_OF_NOTES : ECHO_OF_DRUMS})`
        case 'spread': {
            const [hits, steps] = value as [number, number]
            return `struct("t(${hits},${steps})")`
        }
    }
    return null
}

// The change to the code that gives the pattern this variation, or takes it away when the value
// is null. A variation it has already is written over where it stands, and a new one goes at the
// end of the pattern, before the line that says which bars it plays in.
export function varyEdit<K extends Kind>(code: string, block: PatternBlock, meter: Meter, kind: K, value: Value<K>, notes: boolean): TextEdit | null {
    const was = found(code, block, meter).get(kind)
    const text = callText(kind, value, meter, notes)
    if (!text) return was ? removeCall(was.call) : null
    if (was) return { from: was.call.nameFrom, to: was.call.to, insert: text }
    return addCall(code, block, `.${text}`)
}
