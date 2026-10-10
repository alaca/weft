import { For, Index, Show, type JSX } from 'solid-js'

export type StepRow = { name: string; steps: boolean[]; accents?: boolean[]; played?: boolean[]; muted?: boolean }

const groupsOf = (count: number) => Array.from({ length: Math.ceil(count / 4) }, (_, group) => group)
const INSIDE = [0, 1, 2, 3]

export function StepGrid(props: {
    rows: StepRow[]
    playing: boolean
    position: number
    disabled?: boolean
    onToggle?: (sound: string, step: number) => void
    onAccent?: (sound: string, step: number) => void
    onHear?: (sound: string) => void
    onRemove?: (sound: string) => void
    controls?: (sound: () => string) => JSX.Element
}) {
    const count = () => props.rows[0]?.steps.length ?? 16
    const now = () => (props.playing ? Math.min(count() - 1, Math.floor(props.position * count())) : -1)
    // The names of a kit's own sounds are a few letters. A sound of your own can have a longer
    // name, and the column of names is then made wide enough to read it, up to a point.
    const names = () => Math.min(170, Math.max(74, Math.max(0, ...props.rows.map((row) => row.name.length)) * 6.6 + 46))
    return (
        <div class="dg" classList={{ fine: count() > 16, edit: Boolean(props.onToggle), own: Boolean(props.controls) }} style={{ '--names': `${names()}px` }}>
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
                                <button class="rn" aria-label={`Hear ${row().name}`} title={row().name} onClick={() => props.onHear?.(row().name)}>
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
                                                            loud: on() && Boolean(row().accents?.[step]),
                                                            now: now() === step,
                                                            skip: on() && played() === false,
                                                            ghost: !on() && played() === true,
                                                        }}
                                                        aria-label={`${row().name} step ${step + 1}`}
                                                        aria-pressed={on()}
                                                        data-loud={on() && row().accents?.[step] ? '' : undefined}
                                                        title={props.onAccent ? 'Click for a hit. Shift click, or the A key, for a louder one.' : undefined}
                                                        disabled={props.disabled || !props.onToggle}
                                                        onClick={(event) => (event.shiftKey && props.onAccent ? props.onAccent(row().name, step) : props.onToggle?.(row().name, step))}
                                                        onKeyDown={(event) => {
                                                            if (event.key.toLowerCase() !== 'a' || event.metaKey || event.ctrlKey || !props.onAccent) return
                                                            event.preventDefault()
                                                            props.onAccent(row().name, step)
                                                        }}
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
