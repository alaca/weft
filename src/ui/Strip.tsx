import { createMemo, createSignal, For, Show } from 'solid-js'
import { colorAt, dropOnPattern, eventsOf, openSounds, removePattern, restsNow, select, setControl, setMix, toggleMute, togglePanel, toggleSolo } from '../app/controller'
import { favourites, panOf, volumeOf, type ControlView } from '../controls/views'
import { isDrums, readKit } from '../song/kit'
import { noteText } from '../song/notes'
import type { PatternBlock, PatternView } from '../song/types'
import { describe, STEPS } from '../song/view'
import { fits, takesKit } from '../sounds/apply'
import { cycle, draggedSound, engineState, openPanel, position, revision, selected, soloIds, song, stale, unfolded } from '../stores/song'
import { Knob } from './Knob'
import { MiniView } from './MiniView'
import { NoteRoll } from './NoteRoll'
import { PianoRoll } from './PianoRoll'
import { SoundPanel } from './SoundPanel'
import { Rack } from './Rack'

const linesOf = (block: PatternBlock) => {
    const range = block.lineFrom === block.lineTo ? `line ${block.lineFrom}` : `lines ${block.lineFrom} to ${block.lineTo}`
    return block.muted ? `${range}, muted` : range
}

// Every evaluation asks each pattern again what it plays. Most of the time the answer is the
// same, and saying so here spares the grid or roll below from being worked out again.
const sameView = (a: PatternView, b: PatternView) => JSON.stringify(a) === JSON.stringify(b)

const forcesSolo = (block: PatternBlock) => block.label.length > 1 && block.label.startsWith('S')

export function Strip(props: { id: string }) {
    const index = createMemo(() => song().patterns.findIndex((p) => p.id === props.id))
    const block = createMemo(() => song().patterns[index()])
    const resting = () => restsNow(props.id)
    const playing = () => engineState().playing && !block()?.muted && !resting()
    const panelOwner = () => openPanel()?.split('/')[0] ?? null
    const open = () => openPanel() === props.id
    const folded = () => panelOwner() !== null && panelOwner() !== props.id && !unfolded().includes(props.id)
    const soundOpen = createMemo(() => {
        const target = openPanel()
        if (!block() || panelOwner() !== props.id || target === props.id) return undefined
        return readKit(block())?.rows.find((row) => row.block.id === target)
    })

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
    }, undefined, { equals: sameView })
    const steps = createMemo(() => {
        const current = view()
        return current.kind === 'steps' ? current : null
    })
    const notes = createMemo(() => {
        const current = view()
        return current.kind === 'notes' ? current : null
    })

    const isRoll = () => block() !== undefined && noteText(block()) !== null
    const isRack = () => !isRoll() && notes() === null && block() !== undefined && (steps() !== null || isDrums(block()))

    const knobs = createMemo(() => (block() ? favourites(block()) : []))
    const mix = createMemo((): { fn: 'gain' | 'pan'; name: string; view: ControlView }[] =>
        block()
            ? [
                  { fn: 'gain', name: `Volume of ${props.id}`, view: { ...volumeOf(block()), label: 'Vol' } },
                  { fn: 'pan', name: `Pan of ${props.id}`, view: panOf(block()) },
              ]
            : [],
    )
    const showKnobs = () => !open() && knobs().length > 0

    // A sound dragged from the browser can be let go on a pattern that can take it.
    const [over, setOver] = createSignal(false)
    const takes = () => {
        const item = draggedSound()
        const here = block()
        return item !== null && here !== undefined && !stale() && fits(here, item.group)
    }

    return (
        <Show when={block()}>
            {(current) => (
                <section
                    class="st"
                    classList={{ sel: selected() === props.id, muted: current().muted, rest: resting() }}
                    style={{ '--h': colorAt(index()) }}
                    data-testid={`strip-${props.id}`}
                    data-drop={over() && takes() ? '' : undefined}
                    onClick={() => select(props.id)}
                    onDragOver={(event) => {
                        if (!takes()) return
                        event.preventDefault()
                        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
                        setOver(true)
                    }}
                    onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false)
                    }}
                    onDrop={(event) => {
                        setOver(false)
                        const item = draggedSound()
                        if (!item || !takes()) return
                        event.preventDefault()
                        dropOnPattern(props.id, item)
                    }}
                >
                    <div class="st-h">
                        <i class="bead-h" />
                        <b class="st-n">{props.id}</b>
                        <button
                            class="chip tgl"
                            aria-label={`Change the sound of ${props.id}`}
                            title="Change the sound"
                            onClick={(event) => {
                                event.stopPropagation()
                                openSounds(props.id)
                            }}
                        >
                            {current().soundName ?? (takesKit(current()) ? 'Pick a kit' : 'Pick a sound')}
                        </button>
                        <Show when={folded()}>
                            <MiniView view={view()} />
                        </Show>
                        <span class="grow" />
                        <span class="lines">{linesOf(current())}</span>
                        <button
                            class="rs"
                            classList={{ on: open() }}
                            aria-label={`Sound controls for ${props.id}`}
                            aria-pressed={open()}
                            title="Sound controls"
                            onClick={(event) => {
                                event.stopPropagation()
                                togglePanel(props.id)
                            }}
                        >
                            <svg viewBox="0 0 14 14" aria-hidden="true">
                                <path d="M2 4.5h10M2 9.5h10" />
                                <circle cx="5" cy="4.5" r="1.7" />
                                <circle cx="9" cy="9.5" r="1.7" />
                            </svg>
                        </button>
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
                        <span class="mix" onClick={(event) => event.stopPropagation()}>
                            <For each={mix().map((knob) => knob.fn)}>
                                {(fn) => (
                                    <Show when={mix().find((knob) => knob.fn === fn)}>
                                        {(knob) => <Knob small name={knob().name} view={knob().view} disabled={stale()} onChange={(value) => setMix(props.id, fn, value)} />}
                                    </Show>
                                )}
                            </For>
                        </span>
                        <button
                            class="st-x"
                            aria-label={`Remove the pattern ${props.id}`}
                            title="Remove this pattern"
                            disabled={stale()}
                            onClick={(event) => {
                                event.stopPropagation()
                                removePattern(props.id)
                            }}
                        >
                            <svg viewBox="0 0 8 8" aria-hidden="true">
                                <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
                            </svg>
                        </button>
                    </div>
                    <Show when={!folded()}>
                        <div class="st-b" classList={{ two: showKnobs() }}>
                            <div>
                                <Show when={isRack()}>
                                    <Rack id={props.id} block={current()} played={steps()?.rows ?? []} playing={playing()} position={position()} cycle={cycle()} />
                                </Show>
                                <Show when={isRoll()}>
                                    <NoteRoll id={props.id} block={current()} played={notes()?.notes ?? []} playing={playing()} position={position()} cycle={cycle()} />
                                </Show>
                                <Show when={!isRoll() && notes()}>
                                    {(roll) => (
                                        <>
                                            <PianoRoll lowest={roll().lowest} highest={roll().highest} notes={roll().notes} playing={playing()} position={position()} />
                                            <Show when={current().calls[0]?.name === 'n'}>
                                                <p class="rk-n">This pattern is written in scale steps. It is drawn here but cannot be edited by clicking yet.</p>
                                            </Show>
                                        </>
                                    )}
                                </Show>
                                <Show when={!isRack() && !isRoll() && view().kind === 'empty'}>
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
                        <Show when={soundOpen()}>{(row) => <SoundPanel id={row().block.id} block={row().block} only={row().sound} />}</Show>
                    </Show>
                    <Show when={forcesSolo(current())}>
                        <p class="st-note">Strudel treats a name that starts with a capital S as solo, so the other patterns are silent.</p>
                    </Show>
                </section>
            )}
        </Show>
    )
}
