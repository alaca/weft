import { For, Show } from 'solid-js'
import { noteName } from '../song/view'

// WebKit maps the repaint area into the SVG's own units and rounds it to 1/64 of a unit.
// With a viewBox one unit wide, the strip the playhead leaves behind rounds to nothing and
// the notes under it are not redrawn. Units close to a pixel keep that strip from vanishing.
export const ROLL_WIDTH = 1000
export const ROLL_ROW = 10

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
                <svg viewBox={`0 0 ${ROLL_WIDTH} ${rows() * ROLL_ROW}`} preserveAspectRatio="none">
                    <For each={QUARTERS}>{(x) => <line class="gl" x1={x * ROLL_WIDTH} y1="0" x2={x * ROLL_WIDTH} y2={rows() * ROLL_ROW} />}</For>
                    <For each={props.notes}>
                        {(note) => (
                            <rect
                                class="n"
                                x={note.start * ROLL_WIDTH + 4}
                                y={(top() - note.midi) * ROLL_ROW + 1.2}
                                width={Math.max(10, note.length * ROLL_WIDTH - 8)}
                                height={ROLL_ROW - 2.4}
                            />
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
