import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { copyCode, dragCode, mount, play, trustSong, usualWidth } from '../app/controller'
import { jamming } from '../stores/jam'
import { engineState } from '../stores/song'
import { Divider } from './Divider'
import { MOD } from './keys'


export function CodePane() {
    let root!: HTMLDivElement
    let pane!: HTMLElement
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
        if (state.dirty) return { kind: 'dirty', text: 'Changed', about: `The sound is still the code as it was. Press Update, or ${MOD} Enter, to hear the change.` }
        if (state.playing) return { kind: 'live', text: 'Playing this code' }
        if (state.paused) return { kind: 'idle', text: 'Paused' }
        return { kind: 'idle', text: 'Stopped' }
    }

    return (
        <section class="code" data-testid="code" ref={pane}>
            <Divider side="left" label="Width of the code" width={() => pane.getBoundingClientRect().width} onDrag={dragCode} onUsual={() => usualWidth('code')} />
            <div class="code-h">
                <h2>Code</h2>
                <div class="grow" />
                <span class="sync" data-kind={status().kind} title={status().about}>
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
            <Show when={engineState().error?.guard}>
                <div class="guard" role="status" data-testid="guard">
                    <Show
                        when={jamming()}
                        fallback={
                            <>
                                <p>This song came from someone else, so only music code is played: patterns, sounds and numbers. Read that line. If you trust who made the song, it can be played as it is.</p>
                                <button class="btn" onClick={trustSong}>
                                    Play it anyway
                                </button>
                            </>
                        }
                    >
                        <p>While you jam, only music code is played: patterns, sounds and numbers. Take that line out and the song goes on.</p>
                    </Show>
                </div>
            </Show>
            <div class="ed" ref={root} />
        </section>
    )
}
