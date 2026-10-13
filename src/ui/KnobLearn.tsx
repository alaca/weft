import { onCleanup, onMount, Show } from 'solid-js'
import { learning, learnKnobs, learnt } from '../app/knobs'

// While the knobs of a MIDI controller are being learnt, a line at the foot of the window says
// what is waited for: a knob of the app to be pressed, then one of the controller to be turned.
export function KnobLearn() {
    const escape = (event: KeyboardEvent) => {
        if (learning() !== null && event.key === 'Escape') learnKnobs(false)
    }
    onMount(() => document.addEventListener('keydown', escape))
    onCleanup(() => document.removeEventListener('keydown', escape))
    const waited = () => {
        const now = learning()
        return now && now !== 'picking' ? now.label : null
    }

    return (
        <Show when={learning() !== null}>
            <div class="kl" role="status" data-testid="knob-learn">
                <b>Learning knobs</b>
                <span>
                    <Show when={waited()} fallback={<>{learnt() ? `${learnt()} ` : ''}Press a knob in the app.</>}>
                        Now turn a knob or move a fader on your controller for {waited()}.
                    </Show>
                </span>
                <button class="btn go" onClick={() => learnKnobs(false)}>
                    Done
                </button>
            </div>
        </Show>
    )
}
