import { For, Show } from 'solid-js'
import { noteName } from '../song/view'

const QUARTERS = [0.25, 0.5, 0.75]

export function PianoRoll(props: {
    lowest: number
    highest: number
    notes: { start: number; length: number; midi: number }[]
    playing: boolean
    position: number
}) {
    const top = () => Math.max(props.highest, props.lowest + 4)
    const rows = () => top() - props.lowest + 1
    return (
        <div class="rw">
            <div class="keys">
                <span style={{ top: `${(0.5 / rows()) * 100}%` }}>{noteName(top())}</span>
                <span style={{ top: `${((rows() - 0.5) / rows()) * 100}%` }}>{noteName(props.lowest)}</span>
            </div>
            <div class="roll">
                <svg viewBox={`0 0 1 ${rows()}`} preserveAspectRatio="none">
                    <For each={QUARTERS}>{(x) => <line class="gl" x1={x} y1="0" x2={x} y2={rows()} />}</For>
                    <For each={props.notes}>
                        {(note) => (
                            <rect class="n" x={note.start + 0.004} y={top() - note.midi + 0.12} width={Math.max(0.01, note.length - 0.008)} height="0.76" />
                        )}
                    </For>
                </svg>
                <Show when={props.playing}>
                    <div class="ph" style={{ left: `${props.position * 100}%` }} />
                </Show>
            </div>
        </div>
    )
}
