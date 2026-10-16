import { createEffect, createSignal, on, onCleanup, Show } from 'solid-js'
import { goOn, GUIDE, stopGuide } from '../app/guide'
import { guideGood, guideStep } from '../stores/guide'

type Box = { left: number; top: number; width: number; height: number }

// The step of the first beat that is next, in a card at the bottom left, and a ring around what
// it is about. The ring follows the thing it rings as the window scrolls and changes.
export function GuideCard() {
    const [box, setBox] = createSignal<Box | null>(null)
    let frame = 0
    const follow = () => {
        const at = guideStep()
        const target = at === null ? null : GUIDE[at].target()
        const rect = target?.getBoundingClientRect()
        const next = rect && rect.width && rect.height ? { left: rect.left - 5, top: rect.top - 5, width: rect.width + 10, height: rect.height + 10 } : null
        const was = box()
        if (!next !== !was || (next && was && (next.left !== was.left || next.top !== was.top || next.width !== was.width || next.height !== was.height))) setBox(next)
        frame = requestAnimationFrame(follow)
    }
    createEffect(
        on(guideStep, (at) => {
            cancelAnimationFrame(frame)
            if (at === null) return setBox(null)
            GUIDE[at].target()?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
            frame = requestAnimationFrame(follow)
        }),
    )
    onCleanup(() => cancelAnimationFrame(frame))

    return (
        <Show when={guideStep() !== null ? GUIDE[guideStep()!] : null}>
            {(step) => (
                <>
                    <Show when={box()}>{(ring) => <div class="gd-ring" classList={{ good: guideGood() }} style={{ left: `${ring().left}px`, top: `${ring().top}px`, width: `${ring().width}px`, height: `${ring().height}px` }} />}</Show>
                    <div class="gd" role="status" aria-label="A first beat" data-testid="guide">
                        <span class="cap">
                            A first beat, {guideStep()! + 1} of {GUIDE.length}
                        </span>
                        <p classList={{ good: guideGood() }}>{guideGood() ? 'Done.' : step().text}</p>
                        <div class="gd-a">
                            <button class={step().next ? 'btn go' : 'btn'} onClick={goOn}>
                                {step().next ?? 'Skip'}
                            </button>
                            <Show when={guideStep()! + 1 < GUIDE.length}>
                                <button class="btn" onClick={stopGuide}>
                                    Stop
                                </button>
                            </Show>
                        </div>
                    </div>
                </>
            )}
        </Show>
    )
}
