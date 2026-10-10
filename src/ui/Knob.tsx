import { Match, Show, Switch } from 'solid-js'
import { fromUnit, toUnit } from '../controls/catalog'
import type { ControlView } from '../controls/views'

const ARC = 94.25
const KEY_STEPS: Record<string, number> = { ArrowUp: 0.01, ArrowRight: 0.01, ArrowDown: -0.01, ArrowLeft: -0.01, PageUp: 0.1, PageDown: -0.1 }

function Dial(props: { unit: number }) {
    return (
        <svg viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="20" class="kt" stroke-dasharray={`${ARC} 200`} transform="rotate(135 24 24)" />
            <circle cx="24" cy="24" r="20" class="kv" stroke-dasharray={`${ARC * props.unit} 200`} transform="rotate(135 24 24)" />
            <circle cx="24" cy="24" r="13.5" class="kc" />
            <line x1="24" y1="19.5" x2="24" y2="12.5" class="kp" transform={`rotate(${-135 + 270 * props.unit} 24 24)`} />
        </svg>
    )
}

export function Knob(props: {
    view: ControlView
    big?: boolean
    small?: boolean
    name?: string
    disabled?: boolean
    onChange: (value: number) => void
    onAdd?: () => void
    onRemove?: () => void
}) {
    const unit = () => toUnit(props.view.value, props.view.min, props.view.max, props.view.scale)
    const move = (next: number) => props.onChange(fromUnit(Math.min(1, Math.max(0, next)), props.view.min, props.view.max, props.view.scale))

    let startY = 0
    let startUnit = 0
    const onPointerDown = (event: PointerEvent) => {
        if (props.disabled) return
        ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
        startY = event.clientY
        startUnit = unit()
    }
    const onPointerMove = (event: PointerEvent) => {
        if (!(event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) return
        move(startUnit + ((startY - event.clientY) / 180) * (event.shiftKey ? 0.25 : 1))
    }
    const onKeyDown = (event: KeyboardEvent) => {
        if (props.disabled) return
        if (event.key === 'Home') move(0)
        else if (event.key === 'End') move(1)
        else if (event.key in KEY_STEPS) move(unit() + KEY_STEPS[event.key])
        else return
        event.preventDefault()
    }

    return (
        <Switch>
            <Match when={props.view.state === 'faint' && !props.small}>
                <button class="kn faint" aria-label={`Add ${props.view.label}`} title={props.view.describe} disabled={props.disabled} onClick={() => props.onAdd?.()}>
                    <span class="kn-d">
                        <svg viewBox="0 0 48 48">
                            <circle cx="24" cy="24" r="20" class="kg" />
                            <path d="M24 18v12M18 24h12" class="kgp" />
                        </svg>
                    </span>
                    <b>off</b>
                    <span class="cap">{props.view.label}</span>
                </button>
            </Match>
            <Match when={props.view.state === 'locked'}>
                <div class="kn locked" classList={{ small: props.small }} title="This value is set by code. Edit it in the code.">
                    <span class="kn-d">
                        <Dial unit={0.5} />
                    </span>
                    <b>in code</b>
                    <span class="cap">{props.view.label}</span>
                </div>
            </Match>
            <Match when={true}>
                <div class="kn" classList={{ big: props.big, small: props.small, ghost: props.view.state === 'faint' }}>
                    <div
                        class="kn-d"
                        role="slider"
                        tabindex="0"
                        aria-label={props.name ?? props.view.label}
                        aria-valuemin={props.view.min}
                        aria-valuemax={props.view.max}
                        aria-valuenow={props.view.value}
                        aria-valuetext={props.view.text}
                        aria-disabled={props.disabled ? 'true' : 'false'}
                        title={props.view.describe}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onKeyDown={onKeyDown}
                    >
                        <Dial unit={unit()} />
                    </div>
                    <b>{props.view.text}</b>
                    <span class="cap">{props.view.label}</span>
                    <Show when={props.onRemove}>
                        <button class="kn-x" aria-label={`Remove ${props.view.label}`} disabled={props.disabled} onClick={() => props.onRemove?.()}>
                            <svg viewBox="0 0 8 8">
                                <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
                            </svg>
                        </button>
                    </Show>
                </div>
            </Match>
        </Switch>
    )
}
