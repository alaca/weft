import { For, Index, Show, type JSX } from 'solid-js'

export type StepRow = { name: string; steps: boolean[]; played?: boolean[]; muted?: boolean }

const groupsOf = (count: number) => Array.from({ length: Math.ceil(count / 4) }, (_, group) => group)
const INSIDE = [0, 1, 2, 3]

export function StepGrid(props: {
    rows: StepRow[]
    playing: boolean
    position: number
    disabled?: boolean
    onToggle?: (sound: string, step: number) => void
    onHear?: (sound: string) => void
    onRemove?: (sound: string) => void
    controls?: (sound: () => string) => JSX.Element
}) {
    const count = () => props.rows[0]?.steps.length ?? 16
    const now = () => (props.playing ? Math.min(count() - 1, Math.floor(props.position * count())) : -1)
    return (
        <div class="dg" classList={{ fine: count() > 16, edit: Boolean(props.onToggle), own: Boolean(props.controls) }}>
            <Show when={props.controls}>
                <span />
                <span />
                <span class="rc rc-h" aria-hidden="true">
                    <span />
                    <span class="cap">Vol</span>
                    <span class="cap">Pan</span>
                    <span />
                </span>
            </Show>
            <Index each={props.rows}>
                {(row) => (
                    <>
                        <span class="rh" classList={{ off: row().muted }}>
                            <Show when={props.onHear} fallback={<span class="rn">{row().name}</span>}>
                                <button class="rn" aria-label={`Hear ${row().name}`} onClick={() => props.onHear?.(row().name)}>
                                    {row().name}
                                </button>
                            </Show>
                            <Show when={props.onRemove}>
                                <button class="rx" aria-label={`Remove ${row().name}`} disabled={props.disabled} onClick={() => props.onRemove?.(row().name)}>
                                    <svg viewBox="0 0 8 8">
                                        <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
                                    </svg>
                                </button>
                            </Show>
                        </span>
                        <div class="prow" classList={{ off: row().muted }}>
                            <For each={groupsOf(count())}>
                                {(group) => (
                                    <div class="grp">
                                        <For each={INSIDE}>
                                            {(inside) => {
                                                const step = group * 4 + inside
                                                const on = () => row().steps[step]
                                                const played = () => row().played?.[step]
                                                return (
                                                    <button
                                                        class="pad"
                                                        classList={{
                                                            on: on(),
                                                            now: now() === step,
                                                            skip: on() && played() === false,
                                                            ghost: !on() && played() === true,
                                                        }}
                                                        aria-label={`${row().name} step ${step + 1}`}
                                                        aria-pressed={on()}
                                                        disabled={props.disabled || !props.onToggle}
                                                        onClick={() => props.onToggle?.(row().name, step)}
                                                    />
                                                )
                                            }}
                                        </For>
                                    </div>
                                )}
                            </For>
                        </div>
                        <Show when={props.controls}>{(controls) => controls()(() => row().name)}</Show>
                    </>
                )}
            </Index>
        </div>
    )
}
