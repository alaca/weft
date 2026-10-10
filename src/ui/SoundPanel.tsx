import { createMemo, createSignal, For, Match, Show, Switch } from 'solid-js'
import { addControl, cutsItself, removeControl, setControl, setCut, setEcho, setFilterType, setWave } from '../app/controller'
import { filterTypeOf, soundKind, type FilterType, type PanelGroup } from '../controls/catalog'
import { drumLabel } from '../controls/drums'
import { envelopeOf, envelopePoints } from '../controls/envelope'
import { callFor, panelFor } from '../controls/views'
import { isDrums } from '../song/kit'
import type { PatternBlock } from '../song/types'
import { stale } from '../stores/song'
import { ControlBrowser } from './ControlBrowser'
import { Knob } from './Knob'

const GROUPS: { id: PanelGroup; title: string }[] = [
    { id: 'source', title: 'Source' },
    { id: 'filter', title: 'Filter' },
    { id: 'shape', title: 'Shape' },
    { id: 'effects', title: 'Effects' },
]

const WAVES = [
    { name: 'sine', label: 'Sine wave', path: 'M2 7C5-1 9-1 12 7s7 8 10 0' },
    { name: 'triangle', label: 'Triangle wave', path: 'M2 7l5-5 10 10 5-5' },
    { name: 'square', label: 'Square wave', path: 'M2 11V3h10v8h10V3' },
    { name: 'sawtooth', label: 'Sawtooth wave', path: 'M2 11 12 3v8l10-8v8' },
]

const FILTER_TYPES: { id: FilterType; label: string }[] = [
    { id: 'low', label: 'Low pass' },
    { id: 'high', label: 'High pass' },
    { id: 'band', label: 'Band' },
]

const ECHOES = [
    { value: 0.0625, text: '1/16', label: 'Echo every sixteenth' },
    { value: 0.125, text: '1/8', label: 'Echo every eighth' },
    { value: 0.25, text: '1/4', label: 'Echo every quarter' },
]

const ENVELOPE_WIDTH = 180
const ENVELOPE_HEIGHT = 44

export function SoundPanel(props: { id: string; block: PatternBlock; only?: string }) {
    const [choice, setChoice] = createSignal<FilterType>('low')
    const [browsing, setBrowsing] = createSignal(false)
    const filter = () => filterTypeOf(props.block) ?? choice()
    const panel = createMemo(() => panelFor(props.block, filter()))
    const items = (group: PanelGroup) => panel().find((entry) => entry.group === group)?.items ?? []
    const wave = () => props.block.soundName ?? 'triangle'
    const echo = () => {
        const arg = callFor(props.block, 'delaysync')?.args[0]
        return arg && (arg.kind === 'number' || arg.kind === 'slider') ? arg.value : null
    }
    const sameEcho = (value: number) => echo() !== null && Math.abs((echo() as number) - value) < 1e-6
    const envelope = () =>
        envelopePoints(envelopeOf(props.block), ENVELOPE_WIDTH, ENVELOPE_HEIGHT)
            .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
            .join(' ')

    const pickFilter = (type: FilterType) => {
        if (filterTypeOf(props.block)) setFilterType(props.id, type)
        else setChoice(type)
    }

    return (
        <div onClick={(event) => event.stopPropagation()} data-testid={props.only ? 'row-panel' : 'sound-panel'}>
            <Show when={props.only}>
                {(sound) => (
                    <p class="sp-o">
                        These controls are for <b>{drumLabel(sound())}</b> <code>{sound()}</code> only. The Sound button at the top of the strip is for the whole kit.
                    </p>
                )}
            </Show>
            <div class="sp" classList={{ sub: Boolean(props.only) }}>
                <For each={GROUPS}>
                    {(group) => (
                        <div>
                            <h4>{group.title}</h4>
                            <div class="topw">
                                <Switch>
                                    <Match when={group.id === 'source' && soundKind(props.block) === 'synth'}>
                                        <div class="waves">
                                            <For each={WAVES}>
                                                {(shape) => (
                                                    <button
                                                        class="wv"
                                                        classList={{ on: wave() === shape.name }}
                                                        aria-label={shape.label}
                                                        aria-pressed={wave() === shape.name}
                                                        disabled={stale()}
                                                        onClick={() => setWave(props.id, shape.name)}
                                                    >
                                                        <svg viewBox="0 0 24 14">
                                                            <path d={shape.path} />
                                                        </svg>
                                                    </button>
                                                )}
                                            </For>
                                        </div>
                                    </Match>
                                    <Match when={group.id === 'source'}>
                                        <span class="topn">{props.block.soundName ?? 'Samples'}</span>
                                        <Show when={props.only || !isDrums(props.block)}>
                                            <button
                                                class="chip tgl"
                                                classList={{ on: cutsItself(props.block) }}
                                                aria-pressed={cutsItself(props.block)}
                                                disabled={stale()}
                                                title="A new hit stops the one before it. For long recordings, so that they do not pile up."
                                                onClick={() => setCut(props.id, !cutsItself(props.block))}
                                            >
                                                One at a time
                                            </button>
                                        </Show>
                                    </Match>
                                    <Match when={group.id === 'filter'}>
                                        <div class="seg s">
                                            <For each={FILTER_TYPES}>
                                                {(type) => (
                                                    <button classList={{ on: filter() === type.id }} aria-pressed={filter() === type.id} disabled={stale()} onClick={() => pickFilter(type.id)}>
                                                        {type.label}
                                                    </button>
                                                )}
                                            </For>
                                        </div>
                                    </Match>
                                    <Match when={group.id === 'shape'}>
                                        <svg class="adsr" viewBox={`0 0 ${ENVELOPE_WIDTH} ${ENVELOPE_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
                                            <polygon points={`${envelope()} ${ENVELOPE_WIDTH},${ENVELOPE_HEIGHT - 1} 0,${ENVELOPE_HEIGHT - 1}`} />
                                            <polyline points={envelope()} />
                                        </svg>
                                    </Match>
                                    <Match when={group.id === 'effects'}>
                                        <span class="cap">Echo</span>
                                        <div class="seg s">
                                            <For each={ECHOES}>
                                                {(option) => (
                                                    <button
                                                        classList={{ on: sameEcho(option.value) }}
                                                        aria-label={option.label}
                                                        aria-pressed={sameEcho(option.value)}
                                                        disabled={stale()}
                                                        onClick={() => setEcho(props.id, sameEcho(option.value) ? null : option.value)}
                                                    >
                                                        {option.text}
                                                    </button>
                                                )}
                                            </For>
                                        </div>
                                    </Match>
                                </Switch>
                            </div>
                            <div class="krow">
                                <For each={items(group.id).map((item) => item.fn)}>
                                    {(fn) => (
                                        <Show when={items(group.id).find((item) => item.fn === fn)}>
                                            {(view) => (
                                                <Knob
                                                    view={view()}
                                                    disabled={stale()}
                                                    onChange={(value) => setControl(props.id, fn, value)}
                                                    onAdd={() => addControl(props.id, fn)}
                                                    onRemove={() => removeControl(props.id, fn)}
                                                />
                                            )}
                                        </Show>
                                    )}
                                </For>
                            </div>
                        </div>
                    )}
                </For>
            </div>
            <div class="sp-f">
                <span>Faint knobs are not in the code yet. Press one and its line is added.</span>
                <button class="btn" classList={{ on: browsing() }} aria-expanded={browsing()} onClick={() => setBrowsing(!browsing())}>
                    Browse all controls
                </button>
            </div>
            <Show when={browsing()}>
                <ControlBrowser id={props.id} block={props.block} filter={filter()} />
            </Show>
        </div>
    )
}
