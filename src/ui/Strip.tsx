import { createMemo, For, Show } from 'solid-js'
import { colorAt, eventsOf, select, setControl, setVolume, toggleMute, togglePanel, toggleSolo } from '../app/controller'
import { favourites, volumeOf } from '../controls/views'
import type { PatternBlock, PatternView } from '../song/types'
import { describe, STEPS } from '../song/view'
import { cycle, engineState, openPanel, position, revision, selected, soloIds, song, stale } from '../stores/song'
import { Knob } from './Knob'
import { MiniView } from './MiniView'
import { PianoRoll } from './PianoRoll'
import { SoundPanel } from './SoundPanel'
import { StepGrid } from './StepGrid'

const linesOf = (block: PatternBlock) => {
    const range = block.lineFrom === block.lineTo ? `line ${block.lineFrom}` : `lines ${block.lineFrom} to ${block.lineTo}`
    return block.muted ? `${range}, muted` : range
}

const forcesSolo = (block: PatternBlock) => block.label.length > 1 && block.label.startsWith('S')

export function Strip(props: { id: string }) {
    const index = createMemo(() => song().patterns.findIndex((p) => p.id === props.id))
    const block = createMemo(() => song().patterns[index()])
    const playing = () => engineState().playing
    const open = () => openPanel() === props.id
    const folded = () => openPanel() !== null && !open()

    let seenRows: string[] = []
    let seenAt = -1
    const view = createMemo((): PatternView => {
        const at = revision()
        const described = describe(eventsOf(props.id, playing() ? cycle() : 0))
        if (at !== seenAt) {
            seenRows = []
            seenAt = at
        }
        if (described.kind === 'notes') return described
        const rows = described.kind === 'steps' ? described.rows : []
        for (const row of rows) if (!seenRows.includes(row.name)) seenRows.push(row.name)
        if (!seenRows.length) return { kind: 'empty' }
        return {
            kind: 'steps',
            rows: seenRows.map((name) => rows.find((row) => row.name === name) ?? { name, steps: Array<boolean>(STEPS).fill(false) }),
        }
    })
    const steps = createMemo(() => {
        const current = view()
        return current.kind === 'steps' ? current : null
    })
    const notes = createMemo(() => {
        const current = view()
        return current.kind === 'notes' ? current : null
    })

    const knobs = createMemo(() => (block() ? favourites(block()) : []))
    const volume = createMemo(() => (block() ? volumeOf(block()) : null))
    const showKnobs = () => !open() && knobs().length > 0

    return (
        <Show when={block()}>
            {(current) => (
                <section
                    class="st"
                    classList={{ sel: selected() === props.id, muted: current().muted }}
                    style={{ '--h': colorAt(index()) }}
                    data-testid={`strip-${props.id}`}
                    onClick={() => select(props.id)}
                >
                    <div class="st-h">
                        <i class="bead-h" />
                        <b class="st-n">{props.id}</b>
                        <Show when={current().soundName}>
                            <span class="chip">{current().soundName}</span>
                        </Show>
                        <Show when={folded() && !current().muted}>
                            <MiniView view={view()} />
                        </Show>
                        <span class="grow" />
                        <span class="lines">{linesOf(current())}</span>
                        <Show when={!current().muted}>
                            <button
                                class="chip tgl"
                                classList={{ on: open() }}
                                aria-label={`Sound controls for ${props.id}`}
                                aria-pressed={open()}
                                onClick={(event) => {
                                    event.stopPropagation()
                                    togglePanel(props.id)
                                }}
                            >
                                Sound
                            </button>
                        </Show>
                        <span class="ms">
                            <button
                                classList={{ on: current().muted }}
                                aria-label={`Mute ${props.id}`}
                                aria-pressed={current().muted}
                                disabled={stale()}
                                onClick={(event) => {
                                    event.stopPropagation()
                                    toggleMute(props.id)
                                }}
                            >
                                M
                            </button>
                            <button
                                classList={{ on: soloIds().includes(props.id) }}
                                aria-label={`Solo ${props.id}`}
                                aria-pressed={soloIds().includes(props.id)}
                                disabled={stale()}
                                onClick={(event) => {
                                    event.stopPropagation()
                                    toggleSolo(props.id)
                                }}
                            >
                                S
                            </button>
                        </span>
                        <Show when={volume()}>
                            {(gain) => (
                                <input
                                    class="vol"
                                    classList={{ faint: gain().state === 'faint' }}
                                    type="range"
                                    min={gain().min}
                                    max={gain().max}
                                    step="0.01"
                                    value={gain().value}
                                    aria-label={`Volume of ${props.id}`}
                                    title={gain().state === 'locked' ? 'The volume is set by code' : 'Volume'}
                                    disabled={stale() || gain().state === 'locked'}
                                    onClick={(event) => event.stopPropagation()}
                                    onInput={(event) => setVolume(props.id, Number(event.currentTarget.value))}
                                />
                            )}
                        </Show>
                    </div>
                    <Show when={!current().muted && !folded()}>
                        <div class="st-b" classList={{ two: showKnobs() }}>
                            <div>
                                <Show when={steps()}>{(grid) => <StepGrid rows={grid().rows} playing={playing()} position={position()} />}</Show>
                                <Show when={notes()}>
                                    {(roll) => (
                                        <PianoRoll lowest={roll().lowest} highest={roll().highest} notes={roll().notes} playing={playing()} position={position()} />
                                    )}
                                </Show>
                                <Show when={view().kind === 'empty'}>
                                    <p class="st-empty">Nothing to draw. This pattern makes no sound in this cycle.</p>
                                </Show>
                            </div>
                            <Show when={showKnobs()}>
                                <div class="st-r" onClick={(event) => event.stopPropagation()}>
                                    <For each={knobs().map((knob) => knob.fn)}>
                                        {(fn, at) => (
                                            <Show when={knobs().find((knob) => knob.fn === fn)}>
                                                {(knob) => <Knob view={knob()} big={at() < 2} disabled={stale()} onChange={(value) => setControl(props.id, fn, value)} />}
                                            </Show>
                                        )}
                                    </For>
                                </div>
                            </Show>
                        </div>
                        <Show when={open()}>
                            <SoundPanel id={props.id} block={current()} />
                        </Show>
                    </Show>
                    <Show when={forcesSolo(current())}>
                        <p class="st-note">Strudel treats a name that starts with a capital S as solo, so the other patterns are silent.</p>
                    </Show>
                </section>
            )}
        </Show>
    )
}
