import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { chooseLanding, codeNow, copyCode, dragCode, formatTheCode, landingBeats, mount, performLarger, toggleFormatOnUpdate, togglePerform, trustSong, update, usualWidth } from '../app/controller'
import { DEMO } from '../demo/demo'
import { LARGE_ONLY } from '../engine/pictures'
import { jamming } from '../stores/jam'
import { engineState, formatOnUpdate, formatSaid, landingBars, performing, playMode, song } from '../stores/song'
import { Scenes } from './SongPanel'
import { Divider } from './Divider'
import { ALT, MOD } from './keys'
import { SnippetsMenu } from './SnippetsMenu'


// A pianoroll, a scope and most other pictures are drawn in the code itself, under the line
// that asks for them. These few have no such way, and are drawn on Strudel's one large canvas.
const PICTURES = new RegExp(`\\.(${LARGE_ONLY.join('|')})\\s*\\(`)
// A line that is switched off with two slashes asks for nothing.
const drawsAPicture = (code: string): boolean => code.split('\n').some((line) => PICTURES.test(line.replace(/(^|[^:])\/\/.*$/, '$1')))

const LANDINGS: { bars: 0 | 1 | 4; label: string; about: string }[] = [
    { bars: 0, label: 'At once', about: 'A change comes in as soon as it is updated' },
    { bars: 1, label: 'On the next bar', about: 'A change comes in at the start of the next bar' },
    { bars: 4, label: 'On the next four bars', about: 'A change comes in at the start of the next four bars' },
]

export function CodePane() {
    let root!: HTMLDivElement
    let pane!: HTMLElement
    let timer = 0
    const [copied, setCopied] = createSignal(false)
    // What Strudel draws large it draws on a canvas it finds by this name, and when there is
    // none it makes one over the whole window. This one is in a strip under the code, which is
    // only there while the code asks for one of the few pictures that are drawn that way.
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

    // When a change of the code comes in, chosen beside Update.
    let updateBox!: HTMLDivElement
    const [landingOpen, setLandingOpen] = createSignal(false)
    const away = (event: PointerEvent) => {
        if (landingOpen() && !updateBox.contains(event.target as Node)) setLandingOpen(false)
    }
    onMount(() => document.addEventListener('pointerdown', away))
    onCleanup(() => document.removeEventListener('pointerdown', away))

    const copy = async () => {
        if (!(await copyCode())) return
        setCopied(true)
        window.clearTimeout(timer)
        timer = window.setTimeout(() => setCopied(false), 1600)
    }

    const status = () => {
        const said = formatSaid()
        if (said) return { kind: 'idle', text: said }
        const state = engineState()
        if (state.error) {
            return { kind: 'err', text: state.error.line ? `Line ${state.error.line}: ${state.error.message}` : state.error.message }
        }
        if (state.dirty) return { kind: 'dirty', text: 'Changed', about: `The sound is still the code as it was. Press Update, or ${MOD} Enter, to hear the change.` }
        const waits = landingBeats()
        if (waits !== null) return { kind: 'wait', text: `In ${waits} ${waits === 1 ? 'beat' : 'beats'}`, about: 'The change comes in at the start of the bar. Until then the song plays on as it was.' }
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
                    <SnippetsMenu />
                </Show>
                <Show when={performing()}>
                    <div class="seg s" role="group" aria-label="Size of the code">
                        <button aria-label="Smaller code" title={`Smaller code, ${MOD} -`} onClick={() => performLarger(-2)}>
                            A-
                        </button>
                        <button aria-label="Larger code" title={`Larger code, ${MOD} +`} onClick={() => performLarger(2)}>
                            A+
                        </button>
                    </div>
                </Show>
                <div class="upd" ref={updateBox}>
                    <button class="btn" onClick={update}>
                        Update <kbd>{MOD} Enter</kbd>
                    </button>
                    <button class="btn up-m" aria-label="Options for updating" aria-haspopup="menu" aria-expanded={landingOpen()} title={LANDINGS.find((one) => one.bars === landingBars())?.about} onClick={() => setLandingOpen(!landingOpen())}>
                        <Show when={landingBars()}>
                            <b>{landingBars() === 1 ? 'Bar' : '4 bars'}</b>
                        </Show>
                        <svg viewBox="0 0 10 10" aria-hidden="true">
                            <path d="M2 3.6 5 6.6 8 3.6" />
                        </svg>
                    </button>
                    <Show when={landingOpen()}>
                        <div class="menu single up-dm" role="menu" aria-label="Options for updating">
                            <p class="up-h">When a change comes in</p>
                            <For each={LANDINGS}>
                                {(one) => (
                                    <button
                                        role="menuitemradio"
                                        aria-checked={landingBars() === one.bars}
                                        onClick={() => {
                                            chooseLanding(one.bars)
                                            setLandingOpen(false)
                                        }}
                                    >
                                        {one.label}
                                        <i class="ck-x" classList={{ on: landingBars() === one.bars }} />
                                    </button>
                                )}
                            </For>
                            <p>While the song plays, a change waits for the bar and the song plays on as it was until then, so that it comes in in time.</p>
                            <hr />
                            <button
                                role="menuitem"
                                title="Puts each call of a pattern on a line of its own and the parts of a stack one to a line. Only spaces and line breaks move."
                                onClick={() => {
                                    formatTheCode()
                                    setLandingOpen(false)
                                }}
                            >
                                Format the code
                                <kbd>{ALT} Shift F</kbd>
                            </button>
                            <button role="menuitemcheckbox" aria-checked={formatOnUpdate()} onClick={toggleFormatOnUpdate}>
                                Format on every update
                                <i class="ck-x" classList={{ on: formatOnUpdate() }} />
                            </button>
                        </div>
                    </Show>
                </div>
                <button class="ib pf" classList={{ on: performing() }} aria-label="Performance view" aria-pressed={performing()} title={performing() ? `Back to the song, ${MOD} Shift F` : `The code over the whole window, large, to play live from: ${MOD} Shift F`} onClick={togglePerform}>
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path d={performing() ? 'M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4' : 'M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4'} />
                    </svg>
                </button>
            </div>
            <Show when={performing() && playMode() === 'live'}>
                <div class="pf-sc">
                    <Scenes />
                </div>
            </Show>
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
