import { createMemo, onCleanup, onMount, Show } from 'solid-js'
import { closeTrim, hearTrim, keepTrim, moveTrim } from '../app/controller'
import { lengthText } from '../library/sounds'
import { trim } from '../stores/song'

const WIDE = 480
const HIGH = 120
const STEP = 0.01

// A sound of your own, drawn from its first moment to its last, with the stretch that will be
// kept between two edges. Each edge is dragged, or moved with the arrow keys.
export function TrimDialog() {
    let picture: SVGSVGElement | undefined
    let dragged: 'from' | 'to' | null = null
    const outline = createMemo(() => {
        const now = trim()
        if (!now) return ''
        const loudest = Math.max(0.001, ...now.peaks)
        return now.peaks.map((peak, at) => `M${at + 0.5} ${(HIGH / 2 - (peak / loudest) * (HIGH / 2 - 4)).toFixed(1)}V${(HIGH / 2 + (peak / loudest) * (HIGH / 2 - 4)).toFixed(1)}`).join('')
    })
    const x = (seconds: number) => ((trim()?.seconds ? seconds / trim()!.seconds : 0) * WIDE).toFixed(1)
    const secondsAt = (event: PointerEvent) => {
        const box = picture!.getBoundingClientRect()
        return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * (trim()?.seconds ?? 0)
    }
    const drag = (event: PointerEvent) => {
        const now = trim()
        if (!now || !dragged) return
        if (dragged === 'from') moveTrim(Math.min(secondsAt(event), now.to), now.to)
        else moveTrim(now.from, Math.max(secondsAt(event), now.from))
    }
    const nudge = (edge: 'from' | 'to', event: KeyboardEvent) => {
        const now = trim()
        const by = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
        if (!now || !by) return
        event.preventDefault()
        const step = by * STEP * (event.shiftKey ? 10 : 1)
        if (edge === 'from') moveTrim(now.from + step, now.to)
        else moveTrim(now.from, now.to + step)
    }
    const escape = (event: KeyboardEvent) => {
        if (trim() && event.key === 'Escape') closeTrim()
    }
    onMount(() => document.addEventListener('keydown', escape))
    onCleanup(() => document.removeEventListener('keydown', escape))

    return (
        <Show when={trim()}>
            {(now) => (
                <div
                    class="veil"
                    onPointerDown={(event) => {
                        if (event.target === event.currentTarget) closeTrim()
                    }}
                >
                    <div class="xp tr" role="dialog" aria-modal="true" aria-label={`Cut ${now().name} shorter`} data-testid="trim">
                        <div class="xp-h">
                            <h2>
                                Cut <b>{now().name}</b> shorter
                            </h2>
                        </div>
                        <svg
                            class="tr-w"
                            ref={picture}
                            viewBox={`0 0 ${WIDE} ${HIGH}`}
                            preserveAspectRatio="none"
                            onPointerDown={(event) => {
                                const at = secondsAt(event)
                                dragged = Math.abs(at - now().from) <= Math.abs(at - now().to) ? 'from' : 'to'
                                event.currentTarget.setPointerCapture(event.pointerId)
                                drag(event)
                            }}
                            onPointerMove={drag}
                            onPointerUp={() => (dragged = null)}
                            onPointerCancel={() => (dragged = null)}
                        >
                            <rect class="tr-k" x={x(now().from)} y="0" width={Math.max(0, Number(x(now().to)) - Number(x(now().from)))} height={HIGH} />
                            <path class="tr-o" d={outline()} />
                            <rect class="tr-c" x="0" y="0" width={x(now().from)} height={HIGH} />
                            <rect class="tr-c" x={x(now().to)} y="0" width={Math.max(0, WIDE - Number(x(now().to)))} height={HIGH} />
                            <line class="tr-e" x1={x(now().from)} x2={x(now().from)} y1="0" y2={HIGH} />
                            <line class="tr-e" x1={x(now().to)} x2={x(now().to)} y1="0" y2={HIGH} />
                        </svg>
                        <div class="tr-r">
                            <span class="tr-s" role="slider" tabindex="0" aria-label="Where it starts" aria-valuemin="0" aria-valuemax={now().seconds} aria-valuenow={Math.round(now().from * 1000) / 1000} onKeyDown={(event) => nudge('from', event)}>
                                From {now().from.toFixed(2)} s
                            </span>
                            <span class="tr-s" role="slider" tabindex="0" aria-label="Where it ends" aria-valuemin="0" aria-valuemax={now().seconds} aria-valuenow={Math.round(now().to * 1000) / 1000} onKeyDown={(event) => nudge('to', event)}>
                                to {now().to.toFixed(2)} s
                            </span>
                            <span class="grow" />
                            <span data-testid="trim-length">{lengthText(now().to - now().from)} kept</span>
                        </div>
                        <p class="xp-n">Drag either edge, or move it with the arrow keys. What is outside the edges is cut away for good, in every song that uses this sound.</p>
                        <div class="xp-f">
                            <button class="btn" onClick={hearTrim}>
                                Hear it
                            </button>
                            <span class="grow" />
                            <button class="btn" onClick={closeTrim}>
                                Leave it as it is
                            </button>
                            <button class="btn go" onClick={() => void keepTrim()}>
                                Keep this part
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Show>
    )
}
