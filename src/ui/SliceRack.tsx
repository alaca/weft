import { createMemo, createResource, createSignal, For, Show } from 'solid-js'
import { arrangeSlices, hearSlice, paintSlices, setSliceFit, setSliceLength, setSliceSteps, slicePeaks, toggleSlice, type SliceOrder } from '../app/controller'
import { MOST_PARTS, readSlices, SLICE_RESOLUTIONS, sliceRows } from '../song/slices'
import type { PatternBlock } from '../song/types'
import { engineState, ownSounds, stale } from '../stores/song'
import { GridFooter } from './GridFooter'
import { StepGrid, type StepRow } from './StepGrid'

const WIDE = 1000
const HIGH = 72

const ORDERS: { how: SliceOrder; label: string; about: string }[] = [
    { how: 'order', label: 'In order', about: 'Every part on its own step: the sample as it was' },
    { how: 'backwards', label: 'Backwards', about: 'The last part first' },
    { how: 'shuffle', label: 'Shuffle', about: 'The parts that are there, in an order left to chance' },
    { how: 'clear', label: 'Clear', about: 'No part on any step' },
]

// A sample cut into equal parts. Over the grid is the sample itself with the cuts drawn in:
// a press on a part plays it. In the grid each part is a row, and a hit on a step plays that
// part there, so the parts in a line from the top left down are the sample as it was.
export function SliceRack(props: { id: string; block: PatternBlock; head: HTMLElement; playing: boolean; position: number; cycle: number }) {
    const slices = createMemo(() => readSlices(props.block))
    const [page, setPage] = createSignal(0)
    const [held, setHeld] = createSignal<number | null>(null)
    const cycles = () => slices()?.cycles ?? 1
    const perCycle = () => slices()?.perCycle ?? 16
    const parts = () => slices()?.parts ?? 16
    const shown = () => Math.min(held() ?? (props.playing ? props.cycle % cycles() : page()), cycles() - 1)
    const inSight = () => shown() === props.cycle % cycles()
    const from = () => shown() * perCycle()

    const rows = createMemo((): StepRow[] => {
        const now = slices()
        return now ? sliceRows(now.cells).map((row) => ({ name: row.sound, steps: row.steps.slice(from(), from() + perCycle()) })) : []
    })

    // The sample's shape is asked for once its sound is known, which is a moment after the app
    // has started, and later still for a sound of your own.
    const [shape] = createResource(
        () => (engineState().sounds === 'loading' ? null : `${slices()?.sound.value ?? ''}|${ownSounds().length}`),
        (key) => slicePeaks(key.split('|')[0]),
    )
    const outline = () => {
        const peaks = shape()?.peaks ?? []
        const loudest = Math.max(0.001, ...peaks)
        const each = WIDE / Math.max(1, peaks.length)
        return peaks.map((peak, at) => `M${(at * each + each / 2).toFixed(1)} ${(HIGH / 2 - (peak / loudest) * (HIGH / 2 - 5)).toFixed(1)}V${(HIGH / 2 + (peak / loudest) * (HIGH / 2 - 5)).toFixed(1)}`).join('')
    }
    // The step the song is on changes a few times a beat, and the parts that sound with it.
    const step = createMemo(() => (props.playing && inSight() ? from() + Math.min(perCycle() - 1, Math.floor(props.position * perCycle())) : -1))
    const sounding = createMemo(() => (step() < 0 ? [] : (slices()?.cells[step()] ?? [])))
    const used = createMemo(() => new Set(slices()?.cells.flat() ?? []))
    const partOf = (name: string) => Number(name) - 1

    return (
        <div class="rk sl" classList={{ many: parts() > 16 }} onClick={(event) => event.stopPropagation()}>
            <div class="sl-w" role="group" aria-label={`The parts of ${slices()?.sound.value ?? 'the sample'}`}>
                <svg viewBox={`0 0 ${WIDE} ${HIGH}`} preserveAspectRatio="none" aria-hidden="true">
                    <path d={outline()} />
                </svg>
                <For each={Array.from({ length: parts() }, (_, part) => part)}>
                    {(part) => (
                        <button
                            class="sl-p"
                            classList={{ now: sounding().includes(part), used: used().has(part) }}
                            style={{ left: `${(part / parts()) * 100}%`, width: `${100 / parts()}%` }}
                            aria-label={`Hear part ${part + 1}`}
                            title={`Part ${part + 1}. Press to hear it.`}
                            onClick={() => hearSlice(props.id, part)}
                        >
                            <b>{part + 1}</b>
                        </button>
                    )}
                </For>
                <Show when={!shape.loading && !shape()}>
                    <p class="sl-n">The shape of this sound cannot be shown. Its parts still play.</p>
                </Show>
            </div>
            <StepGrid
                rows={rows()}
                playing={props.playing && inSight()}
                position={props.position}
                disabled={stale()}
                onToggle={(name, at) => toggleSlice(props.id, partOf(name), from() + at)}
                onPaint={(name, first, last, on) => paintSlices(props.id, partOf(name), from() + first, from() + last, on)}
                canPaint={() => slices() !== null}
                onHold={(on) => setHeld(on ? shown() : null)}
                onHear={(name) => hearSlice(props.id, partOf(name))}
            />
            <GridFooter
                head={props.head}
                cycles={cycles()}
                perCycle={perCycle()}
                resolutions={SLICE_RESOLUTIONS}
                canUse={(resolution) => resolution * cycles() <= MOST_PARTS}
                shown={shown()}
                disabled={stale()}
                onPage={setPage}
                onLength={(length) => {
                    setPage(0)
                    setSliceLength(props.id, length)
                }}
                onSteps={(resolution) => setSliceSteps(props.id, resolution)}
            >
                <div class="sl-f">
                    <For each={ORDERS}>
                        {(order) => (
                            <button class="chip tgl" title={order.about} disabled={stale()} onClick={() => arrangeSlices(props.id, order.how)}>
                                {order.label}
                            </button>
                        )}
                    </For>
                    <span class="grow" />
                    <button
                        class="chip tgl"
                        classList={{ on: Boolean(slices()?.fit) }}
                        aria-pressed={Boolean(slices()?.fit)}
                        disabled={stale()}
                        title="Each part is played as fast as fills its step, so a loop follows the tempo and its pitch moves with it. Off, each part is played as fast as it was recorded."
                        onClick={() => setSliceFit(props.id, !slices()?.fit)}
                    >
                        Fit to the tempo
                    </button>
                </div>
            </GridFooter>
        </div>
    )
}
