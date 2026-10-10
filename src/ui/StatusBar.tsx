import { Show } from 'solid-js'
import { layoutIsUsual, resetLayout } from '../app/controller'
import { engineState } from '../stores/song'
import { MOD } from './keys'


const SOUNDS = {
    loading: 'Loading sounds',
    ready: 'Sounds ready',
    failed: 'Drum and instrument samples could not be loaded. Synth sounds still work.',
}

export function StatusBar() {
    return (
        <footer class="sbar" data-testid="status">
            <span data-testid="sounds">{SOUNDS[engineState().sounds]}</span>
            <span>
                <kbd>Space</kbd>play or pause
            </span>
            <span>
                <kbd>{MOD} Enter</kbd>update the sound from the code
            </span>
            <span>
                <kbd>{MOD} .</kbd>silence
            </span>
            <span>
                <kbd>{MOD} Z</kbd>undo
            </span>
            <div class="grow" />
            <Show when={!layoutIsUsual()}>
                <button class="sbar-b" title="Every part shown, at its usual width" onClick={resetLayout}>
                    Reset layout
                </button>
            </Show>
            <span>
                Free and open source. Sound engine: <b>Strudel</b>
            </span>
        </footer>
    )
}
