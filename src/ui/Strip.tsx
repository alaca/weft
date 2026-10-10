import { createMemo, Show } from 'solid-js'
import { colorAt, eventsOf, select, toggleMute, toggleSolo } from '../app/controller'
import type { PatternBlock, PatternView } from '../song/types'
import { describe, STEPS } from '../song/view'
import { cycle, engineState, position, revision, selected, soloIds, song, stale } from '../stores/song'
import { PianoRoll } from './PianoRoll'
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
                        <span class="grow" />
                        <span class="lines">{linesOf(current())}</span>
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
                    </div>
                    <Show when={!current().muted}>
                        <div class="st-b">
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
                    </Show>
                    <Show when={forcesSolo(current())}>
                        <p class="st-note">Strudel treats a name that starts with a capital S as solo, so the other patterns are silent.</p>
                    </Show>
                </section>
            )}
        </Show>
    )
}
