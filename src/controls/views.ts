import type { Arg, Call, PatternBlock } from '../song/types'
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
    state: 'live' | 'number' | 'locked' | 'faint'
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
    const arg = valueArg(call) ?? call.args[0]
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

const MIX = ['gain', 'pan']

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
            def.fn !== 'gain' &&
            !starters.includes(def.fn) &&
            !familyOf(def.fn) &&
            !def.needs &&
            (!def.only || def.only === kind) &&
            !callFor(block, def.fn),
    )
}

export function panelFor(block: PatternBlock, filter?: FilterType): { group: PanelGroup; items: ControlView[] }[] {
    const inCode = present(block).filter((view) => view.fn !== 'gain')
    const kind = soundKind(block)
    const starters = startersFor(kind, filterTypeOf(block) ?? filter ?? 'low')
    return PANEL_GROUPS.map((group) => {
        const first = starters[group].map((fn) => inCode.find((view) => view.fn === fn) ?? faint(CONTROLS.find((def) => def.fn === fn) as ControlDef))
        // A control that only does something together with another is offered beside it, from the
        // moment the other is in the code.
        const beside = CONTROLS.filter((def) => def.group === group && def.needs && (!def.only || def.only === kind) && callFor(block, def.needs))
        const offered = beside.map((def) => inCode.find((view) => view.fn === def.fn) ?? faint(def))
        const rest = inCode.filter((view) => view.group === group && !starters[group].includes(view.fn) && !beside.some((def) => def.fn === view.fn))
        return { group, items: [...first, ...offered, ...rest] }
    })
}

const mixOf = (block: PatternBlock, fn: string): ControlView => present(block).find((view) => view.fn === fn) ?? faint(findDef(fn) as ControlDef)

export const volumeOf = (block: PatternBlock): ControlView => mixOf(block, 'gain')
export const panOf = (block: PatternBlock): ControlView => mixOf(block, 'pan')
