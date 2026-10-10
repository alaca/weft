import { For, Index } from 'solid-js'
import { STEPS } from '../song/view'

const GROUPS = [0, 1, 2, 3]

export function StepGrid(props: { rows: { name: string; steps: boolean[] }[]; playing: boolean; position: number }) {
    const now = () => (props.playing ? Math.min(STEPS - 1, Math.floor(props.position * STEPS)) : -1)
    return (
        <div class="dg">
            <Index each={props.rows}>
                {(row) => (
                    <>
                        <span class="rn">{row().name}</span>
                        <div class="prow">
                            <For each={GROUPS}>
                                {(group) => (
                                    <div class="grp">
                                        <For each={GROUPS}>
                                            {(i) => <div class="pad" classList={{ on: row().steps[group * 4 + i], now: now() === group * 4 + i }} />}
                                        </For>
                                    </div>
                                )}
                            </For>
                        </div>
                    </>
                )}
            </Index>
        </div>
    )
}
