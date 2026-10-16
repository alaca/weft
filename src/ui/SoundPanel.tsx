import { createMemo, createResource, createSignal, For, Match, onMount, Show, Switch } from 'solid-js'
import {
    addControl,
    closeSoundControls,
    cutsItself,
    isPumped,
    midiOutOf,
    midiOutputs,
    pumpDepth,
    pumpFor,
    removeControl,
    savePreset,
    setControl,
    setCut,
    setEcho,
    setFilterType,
    setMidiChannel,
    setMidiOut,
    setMotion,
    setPluginEffect,
    setPump,
    setPumpDepth,
    setWave,
    startMotion,
} from '../app/controller'
import { effectOf, filterTypeOf, findDef, soundKind, type FilterType, type PanelGroup } from '../controls/catalog'
import { PLUGIN_EFFECTS } from '../plugins/list'
import { DEMO } from '../demo/demo'
import { drumLabel } from '../controls/drums'
import { envelopeOf, envelopePoints } from '../controls/envelope'
import { callFor, panelFor } from '../controls/views'
import { outputLabel } from '../library/midi'
import { isDrums } from '../song/kit'
import { isLaid } from '../sounds/apply'
import type { PatternBlock } from '../song/types'
import { stale } from '../stores/song'
import { ControlBrowser } from './ControlBrowser'
import { Knob } from './Knob'

const GROUPS: { id: PanelGroup; title: string }[] = [
    { id: 'source', title: 'Source' },
    { id: 'filter', title: 'Filter' },
    { id: 'shape', title: 'Shape' },
    { id: 'effects', title: 'Effects' },
    { id: 'pattern', title: 'Feel' },
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

// What plays a pattern, as the list has it: the app, or MIDI by the first output there is.
const HERE = 'here'
const FIRST = 'first'

export function SoundPanel(props: { id: string; block: PatternBlock; only?: string }) {
    const [choice, setChoice] = createSignal<FilterType>('low')
    const [browsing, setBrowsing] = createSignal(false)
    // Saving the sound as a preset asks for a name first, and says what came of it after.
    const [naming, setNaming] = createSignal(false)
    const [saved, setSaved] = createSignal<string | null>(null)
    let nameBox: HTMLInputElement | undefined
    const save = () => {
        setSaved(savePreset(props.id, nameBox?.value ?? ''))
        if (nameBox?.value.trim()) setNaming(false)
    }
    // Whether the pattern is played by the app or sent out over MIDI, and to what.
    const out = createMemo(() => midiOutOf(props.block))
    // The desktop app knows what there is to send to. A browser asks whether the page may use
    // MIDI at all, so there the list is only fetched once it is opened.
    const [asking, setAsking] = createSignal('__TAURI_INTERNALS__' in window)
    const [outputs, { refetch }] = createResource(asking, (go) => (go ? midiOutputs() : []))
    const look = () => (asking() ? void refetch() : void setAsking(true))
    // An output the code names stays in the list while it is unplugged, so that it stays chosen.
    const named = () => [...new Set([...(outputs() ?? []), ...(out()?.output ? [out()!.output as string] : [])])]
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

    // Opened under a long grid, the controls would start out of sight. They are brought up far
    // enough that their top shows.
    let box!: HTMLDivElement
    onMount(() => {
        const list = box.closest('.ctl')
        if (!list || box.getBoundingClientRect().top < list.getBoundingClientRect().bottom - 140) return
        box.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    })

    return (
        <div ref={box} class="sp-w" onClick={(event) => event.stopPropagation()} data-testid={props.only ? 'row-panel' : 'sound-panel'}>
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
                            <div class="topw" classList={{ none: group.id === 'pattern' }}>
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
                                        <Show when={(props.only || !isDrums(props.block)) && soundKind(props.block) !== 'plugin'}>
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
                                        <Show when={!props.only}>
                                            <button
                                                class="chip tgl"
                                                classList={{ on: isPumped(props.block) }}
                                                aria-pressed={isPumped(props.block)}
                                                disabled={stale() || (!isPumped(props.block) && !pumpFor(props.id).can)}
                                                title={pumpFor(props.id).why}
                                                onClick={() => setPump(props.id, !isPumped(props.block))}
                                            >
                                                Pump
                                            </button>
                                        </Show>
                                    </Match>
                                </Switch>
                            </div>
                            <div class="krow">
                                <For each={items(group.id).map((item) => item.fn)}>
                                    {(fn) => (
                                        <Show when={items(group.id).find((item) => item.fn === fn)}>
                                            {(view) => (
                                                <Knob
                                                    of={props.id}
                                                    view={view()}
                                                    disabled={stale()}
                                                    onChange={(value) => setControl(props.id, fn, value)}
                                                    onAdd={() => addControl(props.id, fn)}
                                                    onRemove={() => removeControl(props.id, fn)}
                                                    onMotion={(motion) => setMotion(props.id, fn, motion)}
                                                    onStartMotion={findDef(fn)?.steady ? undefined : () => startMotion(props.id, fn)}
                                                />
                                            )}
                                        </Show>
                                    )}
                                </For>
                                <Show when={group.id === 'effects' && !props.only && isPumped(props.block) ? pumpDepth() : null}>
                                    {(depth) => <Knob view={depth()} disabled={stale()} onChange={setPumpDepth} />}
                                </Show>
                            </div>
                            <Show when={group.id === 'effects' && !props.only}>
                                <label class="sp-px">
                                    <span class="cap">Plugin</span>
                                    <select class="sd-s" aria-label={`Plugin effect of ${props.id}`} disabled={stale()} value={effectOf(props.block) ?? ''} onChange={(event) => setPluginEffect(props.id, event.currentTarget.value || null)}>
                                        <option value="">None</option>
                                        <For each={PLUGIN_EFFECTS}>{(plugin) => <option value={plugin.name}>{plugin.label}</option>}</For>
                                    </select>
                                </label>
                            </Show>
                        </div>
                    )}
                </For>
            </div>
            <div class="sp-f">
                <span>Faint knobs are not in the code yet. Press one and its line is added.</span>
                <Show when={!props.only && !isDrums(props.block) && !isLaid(props.block)}>
                    <button
                        class="btn"
                        classList={{ on: naming() }}
                        aria-expanded={naming()}
                        title="Keeps this sound, with every knob as it stands, to use in any song"
                        onClick={() => {
                            setSaved(null)
                            setNaming(!naming())
                            queueMicrotask(() => nameBox?.select())
                        }}
                    >
                        Save as preset
                    </button>
                </Show>
                <button class="btn" classList={{ on: browsing() }} aria-expanded={browsing()} onClick={() => setBrowsing(!browsing())}>
                    Browse all controls
                </button>
                <button class="btn" aria-label={`Close the sound controls of ${props.only ?? props.id}`} onClick={closeSoundControls}>
                    Close
                </button>
            </div>
            <Show when={!DEMO && !props.only && !isDrums(props.block) && !isLaid(props.block)}>
                <div class="sp-m" data-testid={`midi-${props.id}`}>
                    <span class="cap">Played by</span>
                    <select
                        class="sd-s"
                        aria-label={`What plays ${props.id}`}
                        disabled={stale()}
                        value={out() === null ? HERE : (out()!.output ?? FIRST)}
                        onFocus={look}
                        onPointerDown={look}
                        onChange={(event) => setMidiOut(props.id, event.currentTarget.value === HERE ? 'off' : event.currentTarget.value === FIRST ? null : event.currentTarget.value)}
                    >
                        <option value={HERE}>Weft Loom</option>
                        <option value={FIRST}>MIDI, the first output there is</option>
                        <For each={named()}>{(name) => <option value={name}>MIDI, {outputLabel(name)}</option>}</For>
                    </select>
                    <Show when={out()}>
                        <span class="cap">Channel</span>
                        <select class="sd-s sp-c" aria-label={`MIDI channel of ${props.id}`} disabled={stale()} value={String(out()!.channel)} onChange={(event) => setMidiChannel(props.id, Number(event.currentTarget.value))}>
                            <For each={Array.from({ length: 16 }, (_, at) => at + 1)}>{(channel) => <option value={String(channel)}>{channel}</option>}</For>
                        </select>
                        <span class="sp-mn">Its notes go out over MIDI, to a synth or another program, and the app is silent for it.</span>
                    </Show>
                </div>
            </Show>
            <Show when={naming()}>
                <form
                    class="sp-save"
                    onSubmit={(event) => {
                        event.preventDefault()
                        save()
                    }}
                >
                    <input class="br-s" ref={nameBox} aria-label="Name of the preset" placeholder="Name of the preset" maxLength={40} value={props.id} />
                    <button class="btn go" type="submit">
                        Save preset
                    </button>
                </form>
            </Show>
            <Show when={saved()}>
                <p class="sp-said" role="status" data-testid="preset-note">
                    {saved()}
                </p>
            </Show>
            <Show when={browsing()}>
                <ControlBrowser id={props.id} block={props.block} filter={filter()} />
            </Show>
        </div>
    )
}
