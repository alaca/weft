import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { drawTempo, openSoundSettings, replayHeld, setTempo, stillTempo } from '../app/controller'
import { canHearMidi } from '../library/midi'
import { tapped } from '../song/tap'
import { bpm, clockTempo, playMode, song, soundChoice, stale, tempoLane } from '../stores/song'

// Where the tempo cannot be set from the top bar: it is drawn over the song, worked out by code,
// or follows a MIDI clock.
const fixed = () => stale() || song().tempoLocked || tempoLane() !== null || clockTempo() !== null
const tempoNow = () => song().tempo?.bpm ?? bpm()
const FIXED = 'The tempo is not set here now: it is drawn over the song, worked out by code, or follows a MIDI clock.'

// Faster and slower beside the tempo: a beat a minute a press, ten with Shift. Held down, it
// goes on, and the song follows once it is let go.
export function TempoSteps() {
    let timer: number | undefined
    const stop = () => {
        if (timer === undefined) return
        window.clearTimeout(timer)
        timer = undefined
        replayHeld()
    }
    onCleanup(stop)
    const press = (by: number) => (event: PointerEvent) => {
        if (fixed() || event.button !== 0) return
        event.preventDefault()
        const step = event.shiftKey ? by * 10 : by
        const again = (wait: number) => {
            setTempo(Math.round(tempoNow()) + step, true)
            timer = window.setTimeout(() => again(70), wait)
        }
        again(400)
    }
    const key = (by: number) => (event: MouseEvent) => {
        if (event.detail === 0 && !fixed()) setTempo(Math.round(tempoNow()) + (event.shiftKey ? by * 10 : by))
    }
    const arrow = (by: number, label: string, path: string) => (
        <button aria-label={label} title={fixed() ? FIXED : `${label}: a beat a minute, ten with Shift. Hold it down to go on.`} disabled={fixed()} onPointerDown={press(by)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onClick={key(by)}>
            <svg viewBox="0 0 10 6" aria-hidden="true">
                <path d={path} />
            </svg>
        </button>
    )
    return (
        <span class="tm-st">
            {arrow(1, 'Faster', 'M2 4.8 5 1.6 8 4.8')}
            {arrow(-1, 'Slower', 'M2 1.2 5 4.4 8 1.2')}
        </span>
    )
}

// What else there is to the tempo, in a menu under it.
export function TempoMenu() {
    let root!: HTMLDivElement
    const [open, setOpen] = createSignal(false)
    const away = (event: PointerEvent) => {
        if (open() && !root.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
        if (open() && event.key === 'Escape') setOpen(false)
    }
    onMount(() => {
        document.addEventListener('pointerdown', away)
        document.addEventListener('keydown', escape)
    })
    onCleanup(() => {
        document.removeEventListener('pointerdown', away)
        document.removeEventListener('keydown', escape)
    })

    // A tap counts from the moment it is pressed, not let go.
    let taps: number[] = []
    const [tappedBpm, setTappedBpm] = createSignal<number | null>(null)
    const tap = () => {
        if (fixed()) return
        const next = tapped(taps, performance.now())
        taps = next.taps
        setTappedBpm(next.bpm)
        if (next.bpm !== null) setTempo(next.bpm, true)
    }
    const times = (factor: number) => {
        if (!fixed()) setTempo(Math.round(tempoNow() * factor))
    }
    const following = () => soundChoice().follow.kind !== 'off'

    return (
        <div class="tm-x" ref={root}>
            <button class="tm-m" aria-label="Tempo settings" aria-haspopup="menu" aria-expanded={open()} title="Tap tempo, half and double, a tempo drawn over the song, a MIDI clock" onClick={() => setOpen(!open())}>
                <svg viewBox="0 0 10 10" aria-hidden="true">
                    <path d="M2 3.6 5 6.6 8 3.6" />
                </svg>
            </button>
            <Show when={open()}>
                <div class="menu single tm-dm" role="menu" aria-label="Tempo settings">
                    <button
                        class="tm-tap"
                        role="menuitem"
                        disabled={fixed()}
                        title={fixed() ? FIXED : 'Tap in time, and the song takes the tempo of your taps'}
                        onPointerDown={(event) => {
                            event.preventDefault()
                            tap()
                        }}
                        onClick={(event) => event.detail === 0 && tap()}
                    >
                        Tap tempo
                        <Show when={tappedBpm()}>
                            <b data-testid="tapped">{tappedBpm()}</b>
                        </Show>
                    </button>
                    <p>Tap here in time, four times or more, and the song takes the tempo of your taps.</p>
                    <hr />
                    <button role="menuitem" disabled={fixed()} onClick={() => times(0.5)}>
                        Half the tempo
                        <code>{Math.max(20, Math.round(tempoNow() * 0.5))}</code>
                    </button>
                    <button role="menuitem" disabled={fixed()} onClick={() => times(2)}>
                        Double the tempo
                        <code>{Math.min(300, Math.round(tempoNow() * 2))}</code>
                    </button>
                    <Show when={playMode() === 'song'}>
                        <hr />
                        <Show
                            when={tempoLane()}
                            fallback={
                                <button
                                    role="menuitem"
                                    disabled={stale() || song().tempoLocked}
                                    title="Gives every bar a tempo of its own, drawn over the song the way a knob is"
                                    onClick={() => {
                                        drawTempo()
                                        setOpen(false)
                                    }}
                                >
                                    Draw the tempo over the song
                                </button>
                            }
                        >
                            <button
                                role="menuitem"
                                disabled={stale()}
                                onClick={() => {
                                    stillTempo()
                                    setOpen(false)
                                }}
                            >
                                One tempo for the whole song
                            </button>
                        </Show>
                    </Show>
                    <Show when={canHearMidi()}>
                        <hr />
                        <button
                            role="menuitem"
                            onClick={() => {
                                setOpen(false)
                                openSoundSettings()
                            }}
                        >
                            {following() ? 'Follows a MIDI clock' : 'Follow a MIDI clock'}
                            <code>Settings</code>
                        </button>
                    </Show>
                </div>
            </Show>
        </div>
    )
}
