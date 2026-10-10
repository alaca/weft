import { batch, createEffect, createMemo, createSignal, For, Index, onCleanup, onMount, Show, untrack } from 'solid-js'
import { colorAt, eventsOf, select, setBars, songLengthNow, startFrom, toggleBar } from '../app/controller'
import { barsOf, clips, paint, type Clip } from '../song/arrange'
import { MAX_BARS } from '../song/bars'
import type { PatternEvent } from '../song/types'
import { bpm, cycle, engineState, position, revision, song, stale, startBar } from '../stores/song'

// A clip shows what its pattern plays, bar by bar. The pattern is asked for no more bars than
// this: beyond them the drawing repeats, which is true of every pattern that is not random.
const DRAWN_BARS = 16
const UNIT = 100
const INK = 'rgba(22, 22, 24, 0.5)'

// A song can be thousands of bars long. Only the bars in sight, and a few on either side, are
// in the page; the rest is empty width to scroll through.
const ZOOMS = [6, 12, 24, 48, 96]
const SPARE = 4
const EDGE = 28

// The song ends with its last filled bar. There are always this many empty bars after it, and
// never less than the width in sight, so there is room to fill the next ones.
const AFTER = 16
const IN_SIGHT = 20

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i])

function duration(bars: number, tempo: number): string {
    const seconds = Math.round((bars * 240) / Math.max(1, tempo))
    if (seconds < 100) return `${seconds} seconds`
    return `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}

type View = { length: number; shown: number; barWidth: number; first: number; last: number; scroller: () => HTMLDivElement }

function Lane(props: { id: string; index: number; view: View }) {
    let track!: HTMLDivElement
    let drag: { from: number; on: boolean; x: number } | null = null
    let creep = 0
    const block = () => song().patterns.find((p) => p.id === props.id)
    const written = createMemo(() => {
        const current = block()
        const inSong = current ? barsOf(current, props.view.length) : []
        return Array.from({ length: props.view.shown }, (_, bar) => inSong[bar] ?? false)
    })
    const [draft, setDraft] = createSignal<boolean[] | null>(null)
    const bars = () => draft() ?? written()
    const cells = () => Array.from({ length: Math.max(0, props.view.last - props.view.first) })
    const inSight = () => clips(bars()).filter((clip) => clip.from < props.view.last && clip.from + clip.length > props.view.first)

    const played = createMemo(() => {
        revision()
        const perBar: PatternEvent[][] = Array.from({ length: Math.min(props.view.length, DRAWN_BARS) }, (_, bar) => eventsOf(props.id, bar))
        const pitches = perBar.flat().flatMap((event) => (event.midi === null ? [] : [event.midi]))
        return {
            perBar,
            low: Math.min(...pitches),
            high: Math.max(...pitches),
            sounds: [...new Set(perBar.flat().map((event) => event.sound))],
        }
    })

    const drawn = (clip: Clip) => {
        const from = Math.max(clip.from, props.view.first)
        const to = Math.min(clip.from + clip.length, props.view.last)
        const { perBar, low, high, sounds } = played()
        const rows = Math.max(1, high - low + 1)
        const shapes: { x: number; y: number; width: number; height: number }[] = []
        for (let bar = from; bar < to; bar++) {
            for (const event of perBar[bar % perBar.length] ?? []) {
                const x = (bar - from + event.start) * UNIT + 1.5
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
        return { from, bars: Math.max(0, to - from), shapes }
    }

    const barAt = (x: number) => Math.min(props.view.shown - 1, Math.max(0, Math.floor((x - track.getBoundingClientRect().left) / props.view.barWidth)))
    const sweep = () => {
        if (drag) setDraft(paint(written(), drag.from, barAt(drag.x), drag.on))
    }
    // Holding the pointer at either end of the lanes scrolls on, so a run can be longer than
    // what is in sight.
    const scrollOn = () => {
        if (!drag) return
        const scroller = props.view.scroller()
        const box = scroller.getBoundingClientRect()
        const step = drag.x > box.right - EDGE ? 1 : drag.x < box.left + EDGE ? -1 : 0
        if (!step) return
        scroller.scrollLeft += step * Math.max(props.view.barWidth, 12)
        sweep()
    }
    const onPointerDown = (event: PointerEvent) => {
        if (stale() || event.button !== 0) return
        const bar = barAt(event.clientX)
        drag = { from: bar, on: !written()[bar], x: event.clientX }
        setDraft(paint(written(), bar, bar, drag.on))
        track.setPointerCapture(event.pointerId)
        creep = window.setInterval(scrollOn, 60)
    }
    const onPointerMove = (event: PointerEvent) => {
        if (!drag) return
        drag.x = event.clientX
        sweep()
    }
    const finish = (keep: boolean) => {
        const next = draft()
        window.clearInterval(creep)
        if (!drag) return
        drag = null
        batch(() => {
            if (keep && next) setBars(props.id, next)
            setDraft(null)
        })
    }
    onCleanup(() => window.clearInterval(creep))

    return (
        <div
            class="sg-l"
            classList={{ muted: block()?.muted }}
            ref={track}
            style={{ '--h': colorAt(props.index) }}
            data-testid={`lane-${props.id}`}
            data-bars={props.view.length}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => finish(true)}
            onPointerCancel={() => finish(false)}
        >
            <div class="sg-cells" style={{ left: `${props.view.first * props.view.barWidth}px`, 'grid-template-columns': `repeat(${cells().length}, ${props.view.barWidth}px)` }}>
                <Index each={cells()}>
                    {(_, at) => (
                        <button
                            class="sg-b"
                            aria-label={`${props.id} bar ${props.view.first + at + 1}`}
                            aria-pressed={bars()[props.view.first + at] ?? false}
                            disabled={stale()}
                            onClick={(event) => {
                                if (event.detail === 0) toggleBar(props.id, props.view.first + at)
                            }}
                        />
                    )}
                </Index>
            </div>
            <For each={inSight()}>
                {(clip) => (
                    <div class="sg-c" style={{ left: `${clip.from * props.view.barWidth + 2}px`, width: `${Math.max(2, clip.length * props.view.barWidth - 3)}px` }}>
                        <Show when={props.view.barWidth >= 12}>
                            <svg
                                viewBox={`0 0 ${Math.max(1, drawn(clip).bars) * UNIT} ${UNIT}`}
                                preserveAspectRatio="none"
                                aria-hidden="true"
                                style={{ left: `${(drawn(clip).from - clip.from) * props.view.barWidth - 2}px`, width: `${drawn(clip).bars * props.view.barWidth}px` }}
                            >
                                <For each={drawn(clip).shapes}>{(shape) => <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx="1.2" fill={INK} />}</For>
                            </svg>
                        </Show>
                    </div>
                )}
            </For>
        </div>
    )
}

export function SongPanel() {
    let scroller!: HTMLDivElement
    const ids = createMemo(() => [...new Set(song().patterns.map((p) => p.id))], [] as string[], { equals: sameList })
    const length = createMemo(() => songLengthNow())
    const [chosen, setZoom] = createSignal<number | null>(null)
    const [width, setWidth] = createSignal(0)
    const [left, setLeft] = createSignal(0)
    // Until a zoom is chosen, bars are as wide as they can be with a first song and some room
    // after it still in sight.
    const barWidth = createMemo(() => chosen() ?? [...ZOOMS].reverse().find((px) => px * IN_SIGHT <= (width() || 800)) ?? ZOOMS[1])
    const shown = createMemo(() => Math.min(MAX_BARS, Math.max(length() + AFTER, Math.ceil((width() || 800) / barWidth()) + AFTER / 2)))
    const view = createMemo(
        (): View => ({
            length: length(),
            shown: shown(),
            barWidth: barWidth(),
            first: Math.max(0, Math.floor(left() / barWidth()) - SPARE),
            last: Math.min(shown(), Math.ceil((left() + (width() || 800)) / barWidth()) + SPARE),
            scroller: () => scroller,
        }),
    )
    const playing = () => engineState().playing
    const head = () => (playing() ? (cycle() % length()) + position() : startBar())
    const every = () => (barWidth() >= 22 ? 1 : barWidth() >= 9 ? 4 : 16)
    const wider = () => ZOOMS.find((px) => px > barWidth())
    const narrower = () => [...ZOOMS].reverse().find((px) => px < barWidth())

    onMount(() => {
        const watch = new ResizeObserver(() => setWidth(scroller.clientWidth))
        watch.observe(scroller)
        setWidth(scroller.clientWidth)
        onCleanup(() => watch.disconnect())
    })

    createEffect(() => {
        if (!playing()) return
        const at = head() * barWidth()
        const from = untrack(left)
        const seen = untrack(width)
        if (seen && (at < from || at > from + seen - 12)) scroller.scrollLeft = Math.max(0, at - seen * 0.1)
    })

    return (
        <section class="sg" data-testid="song" onClick={(event) => event.stopPropagation()}>
            <div class="sg-h">
                <h3>Song</h3>
                <span class="lines" data-testid="song-length">
                    {length()} bars, {duration(length(), song().tempo?.bpm ?? bpm())}
                </span>
                <span class="grow" />
                <span class="cap">Zoom</span>
                <div class="seg s">
                    <button aria-label="Show more bars" disabled={narrower() === undefined} onClick={() => setZoom(narrower() ?? barWidth())}>
                        -
                    </button>
                    <button aria-label="Show fewer bars" disabled={wider() === undefined} onClick={() => setZoom(wider() ?? barWidth())}>
                        +
                    </button>
                </div>
            </div>
            <div class="sg-g">
                <div class="sg-names">
                    <For each={ids()}>
                        {(id, index) => (
                            <button
                                class="sg-n"
                                classList={{ muted: song().patterns.find((p) => p.id === id)?.muted }}
                                style={{ '--h': colorAt(index()) }}
                                aria-label={`Go to ${id}`}
                                onClick={() => {
                                    select(id)
                                    document.querySelector(`[data-testid="strip-${id}"]`)?.scrollIntoView({ block: 'nearest' })
                                }}
                            >
                                <i />
                                <span>{id}</span>
                            </button>
                        )}
                    </For>
                </div>
                <div class="sg-s" ref={scroller} data-testid="song-scroll" onScroll={() => setLeft(scroller.scrollLeft)}>
                    <div class="sg-t" classList={{ dense: barWidth() < 12 }} style={{ width: `${shown() * barWidth()}px`, '--bar': `${barWidth()}px` }}>
                        <div class="sg-r" style={{ left: `${view().first * barWidth()}px`, 'grid-template-columns': `repeat(${Math.max(0, view().last - view().first)}, ${barWidth()}px)` }}>
                            <Index each={Array.from({ length: Math.max(0, view().last - view().first) })}>
                                {(_, at) => {
                                    const bar = () => view().first + at
                                    return (
                                        <button
                                            classList={{ now: playing() && cycle() % length() === bar(), start: startBar() === bar() && bar() > 0, after: bar() >= length() }}
                                            aria-label={`Start from bar ${bar() + 1}`}
                                            aria-pressed={startBar() === bar()}
                                            disabled={bar() >= length()}
                                            onClick={() => startFrom(bar())}
                                        >
                                            {bar() % every() === 0 ? bar() + 1 : ''}
                                        </button>
                                    )
                                }}
                            </Index>
                        </div>
                        <For each={ids()}>{(id, index) => <Lane id={id} index={index()} view={view()} />}</For>
                        <div class="sg-end" data-testid="song-end" style={{ left: `${length() * barWidth()}px` }} />
                        <Show when={playing() || startBar() > 0}>
                            <div class="sg-ph" classList={{ idle: !playing() }} style={{ left: `${head() * barWidth()}px` }} />
                        </Show>
                    </div>
                </div>
            </div>
        </section>
    )
}
