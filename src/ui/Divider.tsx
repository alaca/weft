// The line between two columns. Dragging it makes the column it belongs to wider or narrower,
// the arrow keys do the same a little at a time, and a double click gives the usual width back.
const STEP = 16

export function Divider(props: { side: 'left' | 'right'; label: string; width: () => number; onDrag: (width: number, done: boolean) => void; onUsual: () => void }) {
    let from = 0
    let widthBefore = 0
    let dragging = false
    const wanted = (event: PointerEvent) => widthBefore + (props.side === 'right' ? event.clientX - from : from - event.clientX)
    return (
        <div
            class="split"
            classList={{ left: props.side === 'left', right: props.side === 'right' }}
            role="separator"
            aria-orientation="vertical"
            aria-label={props.label}
            title="Drag to make wider or narrower. Double click for the usual width."
            tabindex="0"
            onPointerDown={(event) => {
                if (event.button !== 0) return
                dragging = true
                from = event.clientX
                widthBefore = props.width()
                event.currentTarget.setPointerCapture(event.pointerId)
                event.preventDefault()
            }}
            onPointerMove={(event) => {
                if (dragging) props.onDrag(wanted(event), false)
            }}
            onPointerUp={(event) => {
                if (!dragging) return
                dragging = false
                props.onDrag(wanted(event), true)
            }}
            onPointerCancel={() => {
                dragging = false
            }}
            onDblClick={props.onUsual}
            onKeyDown={(event) => {
                const wider = props.side === 'right' ? 'ArrowRight' : 'ArrowLeft'
                const narrower = props.side === 'right' ? 'ArrowLeft' : 'ArrowRight'
                if (event.key !== wider && event.key !== narrower) return
                event.preventDefault()
                props.onDrag(props.width() + (event.key === wider ? STEP : -STEP), true)
            }}
        />
    )
}
