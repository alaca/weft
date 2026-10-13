import { batch, createMemo, createSelector, createSignal, For, Index, onCleanup, Show, type JSX } from 'solid-js'
import type { StepKind } from '../song/grid'
import { beatSteps } from '../song/meter'
import { asksForMenu } from './keys'
import { StepLane } from './StepLane'

export type StepRow = { name: string; steps: boolean[]; accents?: boolean[]; repeats?: number[]; chances?: number[]; played?: boolean[]; muted?: boolean }

// One row's values step by step, shown under that row: what it is of, the value of every step
// in sight, and what stands over the bars to choose another or to clear them.
export type ShownLane = { sound: string; kind: StepKind; values: number[]; head: JSX.Element; onDraw: (from: number, values: number[]) => void }

// The pads stand in groups of a beat: four to a group, or three or six where the bar is
// counted in threes (12 or 24 steps).
const beatOf = (count: number) => beatSteps(count) ?? (count % 3 === 0 ? Math.max(3, count / 4) : 4)
const upTo = (count: number) => Array.from({ length: count }, (_, at) => at)

// A drag along a row, from the step it began on to the one under the pointer: all of them are
// put in when it began on an empty step, and taken out when it began on a hit.
type Run = { sound: string; from: number; to: number; on: boolean }

// A click whose pointer slips less than this many pixels is still a click on the one pad.
const SLIP = 4

export function StepGrid(props: {
    rows: StepRow[]
    playing: boolean
    position: number
    disabled?: boolean
    onToggle?: (sound: string, step: number) => void
    onPaint?: (sound: string, from: number, to: number, on: boolean) => void
    canPaint?: () => boolean
    onHold?: (held: boolean) => void
    onAccent?: (sound: string, step: number) => void
    onHear?: (sound: string) => void
    onRemove?: (sound: string) => void
    controls?: (sound: () => string) => JSX.Element
    lane?: ShownLane
}) {
    const count = () => props.rows[0]?.steps.length ?? 16
    const beat = () => beatOf(count())
    // Where the song is changes with every frame, the step it is on only a few times a beat, and
    // a pad is only worked out again when it becomes that step or stops being it.
    const now = createMemo(() => (props.playing ? Math.min(count() - 1, Math.floor(props.position * count())) : -1))
    const isNow = createSelector(now)
    // The names of a kit's own sounds are a few letters. A sound of your own can have a longer
    // name, and the column of names is then made wide enough to read it, up to a point.
    const names = () => Math.min(170, Math.max(74, Math.max(0, ...props.rows.map((row) => row.name.length)) * 6.6 + 46))

    // The run is only drawn while the drag lasts, and written once, when the pointer is let go.
    const [run, setRun] = createSignal<Run | null>(null)
    let root!: HTMLDivElement
    let lefts: number[] = []
    let press = { x: 0, pointer: -1, moved: false }
    // The step under the pointer is the last pad that begins at or before it, so the gaps between
    // pads belong to the pad before them and a pointer past either end is on the pad at that end.
    const stepAt = (x: number) => {
        let at = 0
        for (let pad = 1; pad < lefts.length && lefts[pad] <= x; pad++) at = pad
        return at
    }
    const begin = (event: PointerEvent, row: StepRow) => {
        const pad = (event.target as HTMLElement).closest<HTMLButtonElement>('.pad')
        if (!pad || pad.disabled || !props.onPaint || event.button !== 0 || asksForMenu(event) || (event.shiftKey && props.onAccent)) return
        if (props.canPaint && !props.canPaint()) return
        const pads = [...(event.currentTarget as HTMLElement).querySelectorAll('.pad')]
        lefts = pads.map((each) => each.getBoundingClientRect().left)
        const step = pads.indexOf(pad)
        // A pad's edge can fall inside a pixel. The press counts for the pad it landed on.
        if (event.clientX < lefts[step]) lefts[step] = event.clientX
        press = { x: event.clientX, pointer: event.pointerId, moved: false }
        props.onHold?.(true)
        setRun({ sound: row.name, from: step, to: step, on: !row.steps[step] })
        // Held by the grid and not by the row, which leaves the page when a sound is removed.
        root.setPointerCapture(event.pointerId)
    }
    const sweep = (event: PointerEvent) => {
        const going = run()
        if (!going || (!press.moved && Math.abs(event.clientX - press.x) < SLIP)) return
        press.moved = true
        const to = stepAt(event.clientX)
        if (to !== going.to) setRun({ ...going, to })
    }
    // Also when the menu opens over a run: WebKit then never tells the page the pointer was let go.
    const finish = (keep: boolean) => {
        const done = run()
        if (!done) return
        batch(() => {
            if (keep) props.onPaint?.(done.sound, Math.min(done.from, done.to), Math.max(done.from, done.to), done.on)
            setRun(null)
            props.onHold?.(false)
        })
        if (root.hasPointerCapture(press.pointer)) root.releasePointerCapture(press.pointer)
    }
    onCleanup(() => {
        if (run()) props.onHold?.(false)
    })
    const drawn = (sound: string, step: number) => {
        const going = run()
        return going !== null && going.sound === sound && step >= Math.min(going.from, going.to) && step <= Math.max(going.from, going.to) ? going.on : null
    }
    return (
        <div
            class="dg"
            classList={{ fine: count() > 16, edit: Boolean(props.onToggle), own: Boolean(props.controls) }}
            style={{ '--names': `${names()}px` }}
            ref={root}
            onPointerMove={sweep}
            onPointerUp={() => finish(true)}
            onPointerCancel={() => finish(false)}
            onLostPointerCapture={() => finish(false)}
            onContextMenu={() => finish(false)}
        >
            <Show when={props.controls}>
                <span />
                <span />
                <span class="rc rc-h" aria-hidden="true">
                    <span />
                    <span class="cap">Vol</span>
                    <span class="cap">Pan</span>
                    <span />
                    <span />
                </span>
            </Show>
            <Index each={props.rows}>
                {(row) => (
                    <>
                        <span class="rh" classList={{ off: row().muted }}>
                            <Show when={props.onHear} fallback={<span class="rn">{row().name}</span>}>
                                <button class="rn" aria-label={`Hear ${row().name}`} title={row().name} onClick={() => props.onHear?.(row().name)}>
                                    {row().name}
                                </button>
                            </Show>
                            <Show when={props.onRemove}>
                                <button class="rx" aria-label={`Remove ${row().name}`} disabled={props.disabled} onClick={() => props.onRemove?.(row().name)}>
                                    <svg viewBox="0 0 8 8">
                                        <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
                                    </svg>
                                </button>
                            </Show>
                        </span>
                        <div class="prow" classList={{ off: row().muted }} onPointerDown={(event) => begin(event, row())}>
                            <For each={upTo(Math.ceil(count() / beat()))}>
                                {(group) => (
                                    <div class="grp" style={{ '--in': beat() }}>
                                        <For each={upTo(beat())}>
                                            {(inside) => {
                                                // Which step a pad is depends on how many stand in a group, and that changes when
                                                // the grid is put on another number of steps while the pad stays in the page.
                                                const step = () => group * beat() + inside
                                                const inRun = () => drawn(row().name, step())
                                                const on = () => inRun() ?? row().steps[step()]
                                                // What the song plays is not compared with a run that is not written yet.
                                                const played = () => (inRun() === null ? row().played?.[step()] : undefined)
                                                const repeats = () => (on() ? (row().repeats?.[step()] ?? 1) : 1)
                                                const chance = () => (on() ? (row().chances?.[step()] ?? 1) : 1)
                                                return (
                                                    <button
                                                        class="pad"
                                                        classList={{
                                                            on: on(),
                                                            loud: on() && Boolean(row().accents?.[step()]),
                                                            now: isNow(step()),
                                                            skip: on() && played() === false,
                                                            ghost: !on() && played() === true,
                                                            maybe: chance() < 1,
                                                        }}
                                                        aria-label={`${row().name} step ${step() + 1}`}
                                                        aria-pressed={on()}
                                                        data-loud={on() && row().accents?.[step()] ? '' : undefined}
                                                        data-rep={repeats() > 1 ? repeats() : undefined}
                                                        data-chance={chance() < 1 ? Math.round(chance() * 100) : undefined}
                                                        title={props.onAccent ? 'Click for a hit, drag along the row for several. Shift click, or the A key, for a louder one.' : undefined}
                                                        disabled={props.disabled || !props.onToggle}
                                                        onClick={(event) => {
                                                            if (event.shiftKey && props.onAccent) props.onAccent(row().name, step())
                                                            // A press of the pointer was already taken as a run of one step. What is
                                                            // left for the click is a press of Space or Enter, which counts no clicks.
                                                            else if (event.detail === 0 || !props.onPaint) props.onToggle?.(row().name, step())
                                                        }}
                                                        onKeyDown={(event) => {
                                                            if (event.key.toLowerCase() !== 'a' || event.metaKey || event.ctrlKey || !props.onAccent) return
                                                            event.preventDefault()
                                                            props.onAccent(row().name, step())
                                                        }}
                                                    />
                                                )
                                            }}
                                        </For>
                                    </div>
                                )}
                            </For>
                        </div>
                        <Show when={props.controls}>{(controls) => controls()(() => row().name)}</Show>
                        <Show when={props.lane?.sound === row().name ? props.lane : undefined}>
                            {(lane) => (
                                <>
                                    <span />
                                    <div class="ln-t">{lane().head}</div>
                                    <Show when={props.controls}>
                                        <span />
                                    </Show>
                                    <span class="rh ln-n">{lane().kind.label}</span>
                                    <StepLane name={row().name} kind={lane().kind} hits={row().steps} values={lane().values} beat={beat()} disabled={props.disabled} onDraw={lane().onDraw} onHold={props.onHold} />
                                    <Show when={props.controls}>
                                        <span />
                                    </Show>
                                </>
                            )}
                        </Show>
                    </>
                )}
            </Index>
        </div>
    )
}
