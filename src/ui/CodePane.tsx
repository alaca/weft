import { createSignal, onCleanup, onMount } from 'solid-js'
import { copyCode, mount, play } from '../app/controller'
import { engineState } from '../stores/song'
import { MOD } from './keys'


export function CodePane() {
    let root!: HTMLDivElement
    let timer = 0
    const [copied, setCopied] = createSignal(false)
    onMount(() => void mount(root))
    onCleanup(() => window.clearTimeout(timer))

    const copy = async () => {
        if (!(await copyCode())) return
        setCopied(true)
        window.clearTimeout(timer)
        timer = window.setTimeout(() => setCopied(false), 1600)
    }

    const status = () => {
        const state = engineState()
        if (state.error) {
            return { kind: 'err', text: state.error.line ? `Line ${state.error.line}: ${state.error.message}` : state.error.message }
        }
        if (state.dirty) return { kind: 'dirty', text: `Changed. Press ${MOD} Enter to hear it.` }
        if (state.playing) return { kind: 'live', text: 'Playing this code' }
        if (state.paused) return { kind: 'idle', text: 'Paused' }
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
                <button class="btn" aria-label="Copy the code" title="Select the whole song and copy it" onClick={copy}>
                    {copied() ? 'Copied' : 'Copy'}
                </button>
                <button class="btn" onClick={play}>
                    Update <kbd>{MOD} Enter</kbd>
                </button>
            </div>
            <div class="ed" ref={root} />
        </section>
    )
}
