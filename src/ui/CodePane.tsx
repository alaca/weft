import { onMount } from 'solid-js'
import { mount, play } from '../app/controller'
import { engineState } from '../stores/song'
import { MOD } from './keys'


export function CodePane() {
    let root!: HTMLDivElement
    onMount(() => void mount(root))

    const status = () => {
        const state = engineState()
        if (state.error) {
            return { kind: 'err', text: state.error.line ? `Line ${state.error.line}: ${state.error.message}` : state.error.message }
        }
        if (state.dirty) return { kind: 'dirty', text: `Changed. Press ${MOD} Enter to hear it.` }
        if (state.playing) return { kind: 'live', text: 'Playing this code' }
        return { kind: 'idle', text: 'Stopped' }
    }

    return (
        <section class="code" data-testid="code">
            <div class="code-h">
                <h2>Code</h2>
                <div class="grow" />
                <span class="sync" data-kind={status().kind}>
                    <i />
                    <span data-testid="code-status">{status().text}</span>
                </span>
                <button class="btn" onClick={play}>
                    Update <kbd>{MOD} Enter</kbd>
                </button>
            </div>
            <div class="ed" ref={root} />
        </section>
    )
}
