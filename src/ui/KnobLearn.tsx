import { onCleanup, onMount, Show } from 'solid-js'
import { isPad, learning, learnKnobs, learnt } from '../app/knobs'

// While the knobs and pads of a MIDI controller are being learnt, a line at the foot of the window
// says what is waited for: a knob, a scene or a button of the app to be pressed, then a knob of
// the controller to be turned or a pad to be pressed.
export function KnobLearn() {
    const escape = (event: KeyboardEvent) => {
        if (learning() !== null && event.key === 'Escape') learnKnobs(false)
    }
    onMount(() => document.addEventListener('keydown', escape))
    onCleanup(() => document.removeEventListener('keydown', escape))
    const waited = () => {
        const now = learning()
        if (!now || now === 'picking') return null
        return isPad(now) ? `Now press a pad or a button on your controller for ${now.label}.` : `Now turn a knob or move a fader on your controller for ${now.label}.`
    }

    return (
        <Show when={learning() !== null}>
            <div class="kl" role="status" data-testid="knob-learn">
                <b>Learning knobs and pads</b>
                <span>
                    <Show when={waited()} fallback={<>{learnt() ? `${learnt()} ` : ''}Press a knob in the app, a scene, or the M or S of a pattern.</>}>
                        {waited()}
                    </Show>
                </span>
                <button class="btn go" onClick={() => learnKnobs(false)}>
                    Done
                </button>
            </div>
        </Show>
    )
}
