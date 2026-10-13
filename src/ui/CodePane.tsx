import { createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { codeNow, copyCode, dragCode, mount, play, trustSong, usualWidth } from '../app/controller'
import { DEMO } from '../demo/demo'
import { jamming } from '../stores/jam'
import { engineState, song } from '../stores/song'
import { Divider } from './Divider'
import { MOD } from './keys'


// The pictures Strudel draws on its one large canvas. The ones with a line in front, _pianoroll
// and the like, are drawn in the code itself and need no room of their own.
const PICTURES = /\.(pianoroll|punchcard|wordfall|spiral|pitchwheel|scope|tscope|fscope|spectrum|draw|onPaint|animate)\s*\(/
// A line that is switched off with two slashes asks for nothing.
const drawsAPicture = (code: string): boolean => code.split('\n').some((line) => PICTURES.test(line.replace(/(^|[^:])\/\/.*$/, '$1')))

export function CodePane() {
    let root!: HTMLDivElement
    let pane!: HTMLElement
    let timer = 0
    const [copied, setCopied] = createSignal(false)
    // A picture written into the code, a pianoroll or a scope, is drawn by Strudel on a canvas
    // it finds by this name, and when there is none it makes one over the whole window. This
    // one is in a strip under the code, which is only there while the code asks for a picture.
    let strip!: HTMLDivElement
    let picture!: HTMLCanvasElement
    const pictured = createMemo(() => (song(), drawsAPicture(codeNow())))
    const fit = () => {
        const dots = window.devicePixelRatio || 1
        const wide = Math.round(strip.clientWidth * dots)
        const high = Math.round(strip.clientHeight * dots)
        if (picture.width !== wide || picture.height !== high) {
            picture.width = wide
            picture.height = high
        }
    }
    const fitted = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    onMount(() => {
        fit()
        fitted?.observe(strip)
        void mount(root)
    })
    onCleanup(() => {
        window.clearTimeout(timer)
        fitted?.disconnect()
    })

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
                <Show when={!DEMO}>
                    <button class="btn" aria-label="Copy the code" title="Select the whole song and copy it" onClick={copy}>
                        {copied() ? 'Copied' : 'Copy'}
                    </button>
                </Show>
                <button class="btn" onClick={play}>
                    Update <kbd>{MOD} Enter</kbd>
                </button>
            </div>
            <Show when={engineState().error?.guard}>
                <div class="guard" role="status" data-testid="guard">
                    <Show when={DEMO}>
                        <p>The demo plays only music code: patterns, sounds and numbers. Take that line out and the song goes on. The app itself plays any code you write.</p>
                    </Show>
                    <Show
                        when={jamming() || DEMO}
                        fallback={
                            <>
                                <p>This song came from someone else, so only music code is played: patterns, sounds and numbers. Read that line. If you trust who made the song, it can be played as it is.</p>
                                <button class="btn" onClick={trustSong}>
                                    Play it anyway
                                </button>
                            </>
                        }
                    >
                        <Show when={!DEMO}>
                            <p>While you jam, only music code is played: patterns, sounds and numbers. Take that line out and the song goes on.</p>
                        </Show>
                    </Show>
                </div>
            </Show>
            <div class="ed" ref={root} />
            <div class="ed-v" classList={{ on: pictured() }} ref={strip} data-testid="code-picture">
                <canvas id="test-canvas" class="ed-p" aria-hidden="true" ref={picture} />
            </div>
        </section>
    )
}
