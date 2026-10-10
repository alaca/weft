import { For, Match, Switch } from 'solid-js'
import type { PatternView } from '../song/types'

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
                        <svg class="mini" viewBox={`0 0 1 ${rows()}`} preserveAspectRatio="none">
                            <For each={data().notes}>{(note) => <rect x={note.start} y={data().highest - note.midi} width={Math.max(0.02, note.length - 0.01)} height="1" />}</For>
                        </svg>
                    )
                }}
            </Match>
        </Switch>
    )
}
