const KEY_STEPS: Record<string, number> = { ArrowUp: 0.01, ArrowRight: 0.01, ArrowDown: -0.01, ArrowLeft: -0.01, PageUp: 0.1, PageDown: -0.1 }

// A fader as on a mixing desk: pushed up for more, pulled down for less. A press anywhere on
// its path puts it there, a double click puts it back where it usually is, and the arrow keys
// move it a little at a time.
export function Fader(props: { name: string; value: number; min: number; max: number; usual: number; text: string; about: string; onChange: (value: number) => void }) {
    let path!: HTMLDivElement
    const unit = () => (props.value - props.min) / (props.max - props.min)
    const move = (next: number) => props.onChange(props.min + Math.min(1, Math.max(0, next)) * (props.max - props.min))
    const at = (event: PointerEvent) => {
        const box = path.getBoundingClientRect()
        return (box.bottom - event.clientY) / box.height
    }
    return (
        <div
            class="fd"
            role="slider"
            tabindex="0"
            aria-orientation="vertical"
            aria-label={props.name}
            aria-valuemin={props.min}
            aria-valuemax={props.max}
            aria-valuenow={props.value}
            aria-valuetext={props.text}
            title={props.about}
            ref={path}
            onPointerDown={(event) => {
                if (event.button !== 0) return
                event.currentTarget.setPointerCapture(event.pointerId)
                move(at(event))
            }}
            onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) move(at(event))
            }}
            onDblClick={() => props.onChange(props.usual)}
            onKeyDown={(event) => {
                if (event.key === 'Home') move(0)
                else if (event.key === 'End') move(1)
                else if (event.key in KEY_STEPS) move(unit() + KEY_STEPS[event.key])
                else return
                event.preventDefault()
            }}
        >
            <i class="fd-u" style={{ bottom: `${((props.usual - props.min) / (props.max - props.min)) * 100}%` }} />
            <i class="fd-f" style={{ height: `${unit() * 100}%` }} />
            <i class="fd-c" style={{ bottom: `${unit() * 100}%` }} />
        </div>
    )
}
