import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { setTempo, toggleClick, toggleCountIn } from '../app/controller'
import { tapped } from '../song/tap'
import { clickOn, clockTempo, countInOn, song, stale, tempoLane } from '../stores/song'

// The metronome beside the transport, and next to it a small menu with the count-in and the
// tapped tempo, as music programs keep them: the click is pressed often, the rest now and then.
export function ClickMenu() {
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

    // The tempo goes by the moment a tap begins, so a tap is a press of the pointer, or a key.
    let taps: number[] = []
    const [tappedBpm, setTappedBpm] = createSignal<number | null>(null)
    const fixed = () => stale() || song().tempoLocked || tempoLane() !== null || clockTempo() !== null
    const tap = () => {
        if (fixed()) return
        const next = tapped(taps, performance.now())
        taps = next.taps
        setTappedBpm(next.bpm)
        if (next.bpm !== null) setTempo(next.bpm, true)
    }

    return (
        <div class="ck" ref={root}>
            <button
                class="ib"
                classList={{ on: clickOn() }}
                aria-pressed={clickOn()}
                aria-label="Metronome"
                title={clickOn() ? 'The metronome is on: a click on every beat while the song plays. It is not in the song, nor in a file made of it.' : 'Metronome: a click on every beat while the song plays'}
                onClick={toggleClick}
            >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path class="ln" stroke-linejoin="round" d="M6.6 2.6h2.8l2.3 10.8H4.3zM8 10.6l3.6-6.2" />
                </svg>
                <i class="ck-d" classList={{ on: countInOn() }} />
            </button>
            <button class="ib ck-m" aria-label="Count-in" aria-haspopup="menu" aria-expanded={open()} title="Count-in: a bar of clicks before the song starts" onClick={() => setOpen(!open())}>
                <svg viewBox="0 0 10 10" aria-hidden="true">
                    <path d="M2 3.6 5 6.6 8 3.6" />
                </svg>
            </button>
            {open() && (
                <div class="menu single ck-dm" role="menu" aria-label="Metronome and count-in">
                    <button role="menuitemcheckbox" aria-checked={clickOn()} onClick={toggleClick}>
                        Metronome
                        <i class="ck-x" classList={{ on: clickOn() }} />
                    </button>
                    <button role="menuitemcheckbox" aria-checked={countInOn()} onClick={toggleCountIn}>
                        Count in one bar
                        <i class="ck-x" classList={{ on: countInOn() }} />
                    </button>
                    <p>A bar of clicks before the song starts. With the song stopped, Record starts it after the count, and the take starts where the song does. Not in a jam.</p>
                    <hr />
                    <button
                        class="ck-tap"
                        disabled={fixed()}
                        title={fixed() ? 'The tempo is not set here now: it is drawn over the song, worked out by code, or follows a MIDI clock.' : 'Tap in time, and the song takes the tempo of your taps'}
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
                </div>
            )}
        </div>
    )
}
