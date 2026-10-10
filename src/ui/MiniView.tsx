import { For, Match, Switch } from 'solid-js'
import type { PatternView } from '../song/types'
import { ROLL_ROW, ROLL_WIDTH } from './PianoRoll'

export function MiniView(props: { view: PatternView }) {
    return (
        <Switch>
            <Match when={props.view.kind === 'steps' && props.view}>
                {(grid) => (
                    <span class="mini">
                        <For each={(grid() as Extract<PatternView, { kind: 'steps' }>).rows.slice(0, 4)}>
                            {(row) => (
                                <span>
                                    <For each={row.steps}>{(on) => <i classList={{ on }} />}</For>
                                </span>
                            )}
                        </For>
                    </span>
                )}
            </Match>
            <Match when={props.view.kind === 'notes' && props.view}>
                {(roll) => {
                    const data = () => roll() as Extract<PatternView, { kind: 'notes' }>
                    const rows = () => data().highest - data().lowest + 1
                    return (
                        <svg class="mini" viewBox={`0 0 ${ROLL_WIDTH} ${rows() * ROLL_ROW}`} preserveAspectRatio="none">
                            <For each={data().notes}>
                                {(note) => (
                                    <rect
                                        x={note.start * ROLL_WIDTH}
                                        y={(data().highest - note.midi) * ROLL_ROW}
                                        width={Math.max(20, note.length * ROLL_WIDTH - 10)}
                                        height={ROLL_ROW}
                                    />
                                )}
                            </For>
                        </svg>
                    )
                }}
            </Match>
        </Switch>
    )
}
