import { batch, createMemo, createSignal, For, Index, Show } from 'solid-js'
import { colorAt, eventsOf, select, setBars, setSongLength, songLengthNow, startFrom, toggleBar } from '../app/controller'
import { barsOf, clips, paint, SONG_LENGTHS, type Clip } from '../song/arrange'
import type { PatternEvent } from '../song/types'
import { bpm, cycle, engineState, position, revision, song, stale, startBar } from '../stores/song'

// A clip shows what its pattern plays, bar by bar. The pattern is asked for no more bars than
// this: beyond them the drawing repeats, which is true of every pattern that is not random.
const DRAWN_BARS = 16
const UNIT = 100
const INK = 'rgba(22, 22, 24, 0.5)'

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i])

function duration(bars: number, tempo: number): string {
    const seconds = Math.round((bars * 240) / Math.max(1, tempo))
    if (seconds < 100) return `${seconds} seconds`
    return `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}

function Lane(props: { id: string; index: number; length: number }) {
    let track!: HTMLDivElement
    let drag: { from: number; on: boolean } | null = null
    const block = () => song().patterns.find((p) => p.id === props.id)
    const written = createMemo(() => {
        const current = block()
        return current ? barsOf(current, props.length) : []
    })
    const [draft, setDraft] = createSignal<boolean[] | null>(null)
    const bars = () => draft() ?? written()

    const played = createMemo(() => {
        revision()
        const perBar: PatternEvent[][] = Array.from({ length: Math.min(props.length, DRAWN_BARS) }, (_, bar) => eventsOf(props.id, bar))
        const pitches = perBar.flat().flatMap((event) => (event.midi === null ? [] : [event.midi]))
        return {
            perBar,
            low: Math.min(...pitches),
            high: Math.max(...pitches),
            sounds: [...new Set(perBar.flat().map((event) => event.sound))],
        }
    })

    const marks = (clip: Clip) => {
        const { perBar, low, high, sounds } = played()
        const rows = Math.max(1, high - low + 1)
        const shapes: { x: number; y: number; width: number; height: number }[] = []
        for (let bar = 0; bar < clip.length; bar++) {
            for (const event of perBar[(clip.from + bar) % perBar.length] ?? []) {
                const x = (bar + event.start) * UNIT + 1.5
                if (event.midi !== null) {
                    const height = Math.max(7, 76 / rows)
                    shapes.push({ x, y: 12 + ((high - event.midi) / Math.max(1, rows - 1)) * (76 - height), width: Math.max(3, event.length * UNIT - 3), height })
                } else {
                    const slot = 76 / Math.max(1, sounds.length)
                    const height = Math.max(4, Math.min(16, slot - 5))
                    shapes.push({ x, y: 12 + sounds.indexOf(event.sound) * slot + (slot - height) / 2, width: 3.4, height })
                }
            }
        }
        return shapes
    }

    const barAt = (event: PointerEvent) => {
        const box = track.getBoundingClientRect()
        return Math.min(props.length - 1, Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * props.length)))
    }
    const onPointerDown = (event: PointerEvent) => {
        if (stale() || event.button !== 0) return
        const bar = barAt(event)
        drag = { from: bar, on: !written()[bar] }
        setDraft(paint(written(), bar, bar, drag.on))
        track.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent) => {
        if (drag) setDraft(paint(written(), drag.from, barAt(event), drag.on))
    }
    const finish = (keep: boolean) => {
        const next = draft()
        if (!drag) return
        drag = null
        batch(() => {
            if (keep && next) setBars(props.id, next)
            setDraft(null)
        })
    }

    return (
        <>
            <button
                class="sg-n"
                classList={{ muted: block()?.muted }}
                style={{ '--h': colorAt(props.index) }}
                aria-label={`Go to ${props.id}`}
                onClick={() => {
                    select(props.id)
                    document.querySelector(`[data-testid="strip-${props.id}"]`)?.scrollIntoView({ block: 'nearest' })
                }}
            >
                <i />
                <span>{props.id}</span>
            </button>
            <div
                class="sg-l"
                classList={{ muted: block()?.muted }}
                ref={track}
                style={{ '--h': colorAt(props.index) }}
                data-testid={`lane-${props.id}`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={() => finish(true)}
                onPointerCancel={() => finish(false)}
            >
                <Index each={bars()}>
                    {(on, bar) => (
                        <button
                            class="sg-b"
                            aria-label={`${props.id} bar ${bar + 1}`}
                            aria-pressed={on()}
                            disabled={stale()}
                            onClick={(event) => {
                                if (event.detail === 0) toggleBar(props.id, bar)
                            }}
                        />
                    )}
                </Index>
                <For each={clips(bars())}>
                    {(clip) => (
                        <div class="sg-c" style={{ left: `calc(${(clip.from / props.length) * 100}% + 2px)`, width: `calc(${(clip.length / props.length) * 100}% - 3px)` }}>
                            <For each={Array.from({ length: clip.length - 1 }, (_, i) => i + 1)}>{(at) => <u style={{ left: `${(at / clip.length) * 100}%` }} />}</For>
                            <svg viewBox={`0 0 ${clip.length * UNIT} ${UNIT}`} preserveAspectRatio="none" aria-hidden="true">
                                <For each={marks(clip)}>{(shape) => <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx="1.2" fill={INK} />}</For>
                            </svg>
                        </div>
                    )}
                </For>
            </div>
        </>
    )
}

export function SongPanel() {
    const ids = createMemo(() => [...new Set(song().patterns.map((p) => p.id))], [] as string[], { equals: sameList })
    const length = createMemo(() => songLengthNow())
    const playing = () => engineState().playing
    const head = () => (playing() ? (cycle() % length()) + position() : startBar())
    const labelled = (bar: number) => length() <= 32 || bar % 4 === 0

    return (
        <section class="sg" data-testid="song" onClick={(event) => event.stopPropagation()}>
            <div class="sg-h">
                <h3>Song</h3>
                <span class="lines" data-testid="song-length">
                    {length()} bars, {duration(length(), song().tempo?.bpm ?? bpm())}
                </span>
                <span class="grow" />
                <span class="cap">Length</span>
                <div class="seg s">
                    <For each={SONG_LENGTHS}>
                        {(bars) => (
                            <button classList={{ on: length() === bars }} aria-label={`Song length ${bars} bars`} aria-pressed={length() === bars} disabled={stale()} onClick={() => setSongLength(bars)}>
                                {bars}
                            </button>
                        )}
                    </For>
                </div>
                <span class="cap">bars</span>
            </div>
            <div class="sg-g" style={{ '--bars': length() }}>
                <div class="sg-r">
                    <Index each={Array.from({ length: length() })}>
                        {(_, bar) => (
                            <button
                                classList={{ now: playing() && cycle() % length() === bar, start: startBar() === bar && bar > 0 }}
                                aria-label={`Start from bar ${bar + 1}`}
                                aria-pressed={startBar() === bar}
                                onClick={() => startFrom(bar)}
                            >
                                {labelled(bar) ? bar + 1 : ''}
                            </button>
                        )}
                    </Index>
                </div>
                <For each={ids()}>{(id, index) => <Lane id={id} index={index()} length={length()} />}</For>
                <div class="sg-w">
                    <Show when={playing() || startBar() > 0}>
                        <div class="sg-ph" classList={{ idle: !playing() }} style={{ left: `${(head() / length()) * 100}%` }} />
                    </Show>
                </div>
            </div>
        </section>
    )
}
