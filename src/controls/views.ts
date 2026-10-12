import { readCurve } from '../song/curves'
import type { Arg, Call, PatternBlock } from '../song/types'
import { readMotion, type Motion } from './motion'
import {
    CONTROLS,
    familyOf,
    filterTypeOf,
    findDef,
    soundKind,
    startersFor,
    writeNumber,
    type ControlDef,
    type FilterType,
    type Group,
    type PanelGroup,
    type Scale,
} from './catalog'

export type ControlView = {
    fn: string
    label: string
    group: Group
    describe: string
    state: 'live' | 'number' | 'locked' | 'faint' | 'moving' | 'drawn'
    motion?: Motion
    // The value of every bar, for a control that is drawn over the song.
    curve?: number[]
    value: number
    min: number
    max: number
    scale: Scale
    text: string
}

const PANEL_GROUPS: PanelGroup[] = ['source', 'filter', 'shape', 'effects', 'pattern']
const MAX_FAVOURITES = 4

const withUnit = (text: string, unit: string) => (unit ? `${text} ${unit}` : text)

export function callFor(block: PatternBlock, fn: string): Call | undefined {
    const names = findDef(fn)?.names ?? [fn]
    return block.calls.find((call) => names.includes(call.name))
}

function faint(def: ControlDef): ControlView {
    return { fn: def.fn, label: def.label, group: def.group, describe: def.describe, state: 'faint', value: def.initial, min: def.min, max: def.max, scale: def.scale, text: 'off' }
}

type Value = Extract<Arg, { kind: 'number' | 'slider' }>

const sliderIn = (arg: Arg): Value | null => {
    if (arg.kind === 'slider') return arg
    if (arg.kind !== 'chain') return null
    for (const call of arg.calls) {
        for (const inner of call.args) {
            const found = sliderIn(inner)
            if (found) return found
        }
    }
    return null
}

// The number a knob turns: the first thing in the brackets when that is a number or a slider,
// or else the slider written somewhere inside it, as in nudge(rand.range(0, slider(...))).
export function valueArg(call: Call | undefined): Value | null {
    const arg = call?.args[0]
    if (!arg) return null
    return arg.kind === 'number' ? arg : sliderIn(arg)
}

function viewOfCall(call: Call): ControlView | null {
    const def = findDef(call.name)
    // A slider written inside the brackets of a call the controls do not know is not that call's knob:
    // the first line of a drum kit holds the sliders of all its rows.
    const arg = (def ? valueArg(call) : null) ?? call.args[0]
    if (!arg) return null
    if (!def && arg.kind !== 'slider') return null
    const base = {
        fn: def?.fn ?? call.name,
        label: def?.label ?? call.name,
        group: def?.group ?? ('pattern' as Group),
        describe: def?.describe ?? `The slider in .${call.name}( )`,
    }
    const unit = def?.unit ?? ''
    if (arg.kind === 'slider') {
        return { ...base, state: 'live', value: arg.value, min: arg.min, max: arg.max, scale: 'linear', text: withUnit(writeNumber(arg.value, arg.min, arg.max), unit) }
    }
    if (!def) return null
    if (arg.kind === 'number') {
        const min = Math.min(def.min, arg.value)
        const max = Math.max(def.max, arg.value)
        return { ...base, state: 'number', value: arg.value, min, max, scale: def.scale, text: withUnit(writeNumber(arg.value, min, max), unit) }
    }
    const motion = readMotion(call)
    if (motion) {
        const min = Math.min(def.min, motion.from, motion.to)
        const max = Math.max(def.max, motion.from, motion.to)
        return { ...base, state: 'moving', motion, value: motion.to, min, max, scale: def.scale, text: `${writeNumber(motion.from, min, max)} to ${withUnit(writeNumber(motion.to, min, max), unit)}` }
    }
    const curve = def.wrap ? null : readCurve(call)
    if (curve) {
        const numbers = curve.values.map(Number)
        const low = Math.min(...numbers)
        const high = Math.max(...numbers)
        const min = Math.min(def.min, low)
        const max = Math.max(def.max, high)
        const text = low === high ? withUnit(writeNumber(high, min, max), unit) : `${writeNumber(low, min, max)} to ${withUnit(writeNumber(high, min, max), unit)}`
        return { ...base, state: 'drawn', curve: numbers, value: high, min, max, scale: def.scale, text }
    }
    return { ...base, state: 'locked', value: def.initial, min: def.min, max: def.max, scale: def.scale, text: 'in code' }
}

function present(block: PatternBlock): ControlView[] {
    const seen = new Set<string>()
    const views: ControlView[] = []
    for (const call of block.calls) {
        const view = viewOfCall(call)
        if (!view || seen.has(view.fn)) continue
        seen.add(view.fn)
        views.push(view)
    }
    return views
}

// The controls of a pattern that are drawn over the song, and those that could be: the ones
// that are a plain number, a slider or a motion now, and are written as one value.
export const drawnIn = (block: PatternBlock): ControlView[] => present(block).filter((view) => view.state === 'drawn')
export function drawableIn(block: PatternBlock): ControlView[] {
    return present(block).filter((view) => {
        const def = findDef(view.fn)
        if (!def || def.wrap) return false
        if (view.state === 'moving') return true
        return (view.state === 'live' || view.state === 'number') && valueArg(callFor(block, view.fn)) === callFor(block, view.fn)?.args[0]
    })
}

const MIX = ['volume', 'pan']

export function favourites(block: PatternBlock): ControlView[] {
    return present(block)
        .filter((view) => !MIX.includes(view.fn))
        .slice(0, MAX_FAVOURITES)
}

export function browserItems(block: PatternBlock, filter: FilterType): ControlDef[] {
    const kind = soundKind(block)
    const starters = Object.values(startersFor(kind, filterTypeOf(block) ?? filter)).flat()
    return CONTROLS.filter(
        (def) =>
            def.group !== 'pattern' &&
            !MIX.includes(def.fn) &&
            !starters.includes(def.fn) &&
            !familyOf(def.fn) &&
            !def.needs &&
            (!def.only || def.only === kind) &&
            !callFor(block, def.fn),
    )
}

export function panelFor(block: PatternBlock, filter?: FilterType): { group: PanelGroup; items: ControlView[] }[] {
    // How loud a pattern is and where it sits are not in its panel: they are the first two
    // knobs under what it plays, and stay there while the panel is open.
    const inCode = present(block).filter((view) => !MIX.includes(view.fn))
    const kind = soundKind(block)
    const starters = startersFor(kind, filterTypeOf(block) ?? filter ?? 'low')
    return PANEL_GROUPS.map((group) => {
        const first = starters[group].filter((fn) => !MIX.includes(fn)).map((fn) => inCode.find((view) => view.fn === fn) ?? faint(CONTROLS.find((def) => def.fn === fn) as ControlDef))
        // A control that only does something together with another is offered beside it, from the
        // moment the other is in the code.
        const beside = CONTROLS.filter((def) => def.group === group && def.needs && (!def.only || def.only === kind) && callFor(block, def.needs))
        const offered = beside.map((def) => inCode.find((view) => view.fn === def.fn) ?? faint(def))
        const rest = inCode.filter((view) => view.group === group && !starters[group].includes(view.fn) && !beside.some((def) => def.fn === view.fn))
        return { group, items: [...first, ...offered, ...rest] }
    })
}

// One control of a pattern as a knob: as it is in the code, or faint when it is not there.
export const controlOf = (block: PatternBlock, fn: string): ControlView => present(block).find((view) => view.fn === fn) ?? faint(findDef(fn) as ControlDef)
const mixOf = controlOf

export const volumeOf = (block: PatternBlock): ControlView => mixOf(block, 'volume')
export const panOf = (block: PatternBlock): ControlView => mixOf(block, 'pan')
