import { createSignal, For, onCleanup } from 'solid-js'
import { fromUnit, toUnit } from '../controls/catalog'
import type { StepKind } from '../song/grid'

const upTo = (count: number) => Array.from({ length: count }, (_, at) => at)

// How a value reads beside its bar.
export function stepText(kind: StepKind, value: number): string {
    if (kind.what === 'repeats') return value === 1 ? 'once' : `${value} times`
    if (kind.what === 'chance') return `${Math.round(value * 100)}%`
    if (kind.what === 'lpf') return `${Math.round(value)} Hz`
    if (kind.what === 'pan') return value === 0.5 ? 'centre' : value < 0.5 ? `${Math.round((0.5 - value) * 200)}% left` : `${Math.round((value - 0.5) * 200)}% right`
    return String(Number(value.toFixed(2)))
}

// One thing every step of a row has a value of its own for, as a bar over each hit. A press or
// a drag over the bars sets them to the height of the pointer, drawn as it goes and written
// once, when the pointer is let go. The arrow keys move one bar, and a double click puts it
// back where it usually stands.
export function StepLane(props: {
    name: string
    kind: StepKind
    hits: boolean[]
    values: number[]
    beat: number
    disabled?: boolean
    // What a step without a bar says of itself, where that is not a step without a hit.
    empty?: string
    onDraw: (from: number, values: number[]) => void
    onHold?: (held: boolean) => void
}) {
    const scale = () => (props.kind.log ? 'log' : 'linear')
    const unitOf = (value: number) => toUnit(value, props.kind.min, props.kind.max, scale())
    const valueAt = (unit: number) => {
        const value = fromUnit(Math.min(1, Math.max(0, unit)), props.kind.min, props.kind.max, scale())
        return props.kind.what === 'repeats' ? Math.round(value) : value
    }
    const [drawn, setDrawn] = createSignal<Map<number, number> | null>(null)
    let root!: HTMLDivElement
    let lefts: number[] = []
    let box = { top: 0, height: 1 }
    let last: { step: number; value: number } | null = null
    let pointer = -1

    const stepAt = (x: number) => {
        let at = 0
        for (let bar = 1; bar < lefts.length && lefts[bar] <= x; bar++) at = bar
        return at
    }
    const put = (event: PointerEvent) => {
        const step = stepAt(event.clientX)
        const value = valueAt(1 - (event.clientY - box.top) / box.height)
        const next = new Map(drawn() ?? [])
        // A fast drag skips bars. The ones between two places of the pointer lie on the line between them.
        const from = last ?? { step, value }
        const span = Math.abs(step - from.step)
        for (let at = 0; at <= span; at++) {
            const along = span ? at / span : 1
            const between = from.step + Math.sign(step - from.step) * at
            if (props.hits[between]) next.set(between, valueAt(unitOf(from.value) + (unitOf(value) - unitOf(from.value)) * along))
        }
        last = { step, value }
        setDrawn(next)
    }
    const begin = (event: PointerEvent) => {
        if (props.disabled || event.button !== 0) return
        const bars = [...root.querySelectorAll('.lb')]
        lefts = bars.map((bar) => bar.getBoundingClientRect().left)
        const area = root.getBoundingClientRect()
        box = { top: area.top, height: Math.max(1, area.height) }
        last = null
        pointer = event.pointerId
        props.onHold?.(true)
        root.setPointerCapture(event.pointerId)
        put(event)
    }
    const finish = (keep: boolean) => {
        const done = drawn()
        if (!done) return
        setDrawn(null)
        last = null
        props.onHold?.(false)
        if (root.hasPointerCapture(pointer)) root.releasePointerCapture(pointer)
        if (!keep || !done.size) return
        const steps = [...done.keys()]
        const from = Math.min(...steps)
        const to = Math.max(...steps)
        props.onDraw(
            from,
            upTo(to - from + 1).map((at) => done.get(from + at) ?? props.values[from + at]),
        )
    }
    onCleanup(() => {
        if (drawn()) props.onHold?.(false)
    })

    const shown = (step: number) => drawn()?.get(step) ?? props.values[step] ?? props.kind.usual
    const nudge = (step: number, by: number) => {
        const now = props.values[step] ?? props.kind.usual
        const next = props.kind.what === 'repeats' ? now + by : valueAt(unitOf(now) + by * 0.05)
        props.onDraw(step, [next])
    }
    return (
        <div
            class="prow ln"
            role="group"
            aria-label={`${props.kind.label} of ${props.name}, step by step`}
            ref={root}
            onPointerDown={begin}
            onPointerMove={(event) => {
                if (drawn()) put(event)
            }}
            onPointerUp={() => finish(true)}
            onPointerCancel={() => finish(false)}
            onLostPointerCapture={() => finish(false)}
            // Asked of the lane and not of the bar: while the pointer is held the lane has it,
            // so that is where a double click arrives.
            onDblClick={(event) => {
                if (props.disabled) return
                lefts = [...root.querySelectorAll('.lb')].map((bar) => bar.getBoundingClientRect().left)
                const step = stepAt(event.clientX)
                if (props.hits[step]) props.onDraw(step, [props.kind.usual])
            }}
        >
            <For each={upTo(Math.ceil(props.hits.length / props.beat))}>
                {(group) => (
                    <div class="grp" style={{ '--in': props.beat }}>
                        <For each={upTo(props.beat)}>
                            {(inside) => {
                                const step = () => group * props.beat + inside
                                const hit = () => Boolean(props.hits[step()])
                                return (
                                    <button
                                        class="lb"
                                        classList={{ on: hit() }}
                                        role="slider"
                                        aria-label={`${props.kind.label} of ${props.name} step ${step() + 1}`}
                                        aria-valuemin={props.kind.min}
                                        aria-valuemax={props.kind.max}
                                        aria-valuenow={shown(step())}
                                        aria-valuetext={stepText(props.kind, shown(step()))}
                                        title={hit() ? stepText(props.kind, shown(step())) : (props.empty ?? 'No hit on this step')}
                                        disabled={props.disabled || !hit()}
                                        style={{ '--v': hit() ? Math.max(0.08, unitOf(shown(step()))) : 0 }}
                                        onKeyDown={(event) => {
                                            const by = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? -1 : 0
                                            if (!by) return
                                            event.preventDefault()
                                            nudge(step(), by)
                                        }}
                                    >
                                        <i />
                                    </button>
                                )
                            }}
                        </For>
                    </div>
                )}
            </For>
        </div>
    )
}
