import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { layoutIsUsual, resetLayout } from '../app/controller'
import { DEMO } from '../demo/demo'
import { engineState } from '../stores/song'
import { MOD } from './keys'


const SOUNDS = {
    loading: 'Loading sounds',
    ready: 'Sounds ready',
    failed: 'Drum and instrument samples could not be loaded. Synth sounds still work.',
}

export function StatusBar() {
    // Without a network the sounds that were played before still play, from the copies kept on
    // this machine. One that never was is silent, and this says why.
    const [online, setOnline] = createSignal(navigator.onLine)
    const there = () => setOnline(true)
    const gone = () => setOnline(false)
    onMount(() => {
        window.addEventListener('online', there)
        window.addEventListener('offline', gone)
    })
    onCleanup(() => {
        window.removeEventListener('online', there)
        window.removeEventListener('offline', gone)
    })
    return (
        <footer class="sbar" data-testid="status">
            <span data-testid="sounds">{SOUNDS[engineState().sounds]}</span>
            <Show when={!online() && !DEMO}>
                <span class="sbar-off" data-testid="offline" title="Sounds you have played before are kept on this machine and still play. A sound you have never played needs the network once.">
                    No network: sounds you have played before still play
                </span>
            </Show>
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
