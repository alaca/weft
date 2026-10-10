import { batch, createEffect, createMemo, createSignal, For, Index, onCleanup, onMount, Show, untrack } from 'solid-js'
import { clearLoop, colorAt, eventsOf, inStep, loopBetween, patternText, repeatLoop, select, setBars, songLengthNow, startFrom, toggleBar } from '../app/controller'
import { barsOf, clips, paint, type Clip } from '../song/arrange'
import { MAX_BARS } from '../song/bars'
import type { PatternEvent } from '../song/types'
import { bpm, cycle, engineState, loopBars, position, revision, song, stale, startBar } from '../stores/song'

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

    // A clip that did not change keeps its object, and so its place in the page.
    let keptClips = new Map<string, Clip>()
    const inSight = createMemo(() => {
        const next = new Map<string, Clip>()
        const list = clips(bars())
            .filter((clip) => clip.from < props.view.last && clip.from + clip.length > props.view.first)
            .map((clip) => {
                const key = `${clip.from}:${clip.length}`
                const same = keptClips.get(key) ?? clip
                next.set(key, same)
                return same
            })
        keptClips = next
        return list
    })

    // The pattern is only asked what it plays when its text has changed since the last time.
    // Changing the bars of the song evaluates the code again but leaves every picture as it was.
    let drawnFrom: string | null = null
    type Played = { perBar: PatternEvent[][]; low: number; high: number; sounds: (string | null)[] }
    const played = createMemo((before: Played | undefined): Played => {
        revision()
        const count = Math.min(props.view.length, DRAWN_BARS)
        const text = untrack(() => patternText(props.id))
        if (before && text === drawnFrom && before.perBar.length === count) return before
        // Until the code has been evaluated the patterns still answer for the code before it,
        // which after opening another song is another song. Nothing is drawn from that.
        if (!untrack(inStep)) return before ?? { perBar: [], low: 0, high: 0, sounds: [] }
        drawnFrom = text
        const perBar: PatternEvent[][] = Array.from({ length: count }, (_, bar) => eventsOf(props.id, bar))
        const pitches = perBar.flat().flatMap((event) => (event.midi === null ? [] : [event.midi]))
        return {
            perBar,
            low: Math.min(...pitches),
            high: Math.max(...pitches),
            sounds: [...new Set(perBar.flat().map((event) => event.sound))],
        }
    }, undefined)

    const drawn = (clip: Clip) => {
        const from = Math.max(clip.from, props.view.first)
        const to = Math.min(clip.from + clip.length, props.view.last)
        const { perBar, low, high, sounds } = played()
        const rows = Math.max(1, high - low + 1)
        // One path for the whole picture: a clip of a long song would otherwise be thousands of
        // small shapes for the page to make.
        let path = ''
        const box = (x: number, y: number, width: number, height: number) => {
            path += `M${x.toFixed(1)} ${y.toFixed(1)}h${width.toFixed(1)}v${height.toFixed(1)}h${(-width).toFixed(1)}z`
        }
        for (let bar = from; bar < to; bar++) {
            for (const event of perBar[bar % perBar.length] ?? []) {
                const x = (bar - from + event.start) * UNIT + 1.5
                if (event.midi !== null) {
                    const height = Math.max(7, 76 / rows)
                    box(x, 12 + ((high - event.midi) / Math.max(1, rows - 1)) * (76 - height), Math.max(3, event.length * UNIT - 3), height)
                } else {
                    const slot = 76 / Math.max(1, sounds.length)
                    const height = Math.max(4, Math.min(16, slot - 5))
                    box(x, 12 + sounds.indexOf(event.sound) * slot + (slot - height) / 2, 3.4, height)
                }
            }
        }
        return { from, bars: Math.max(0, to - from), path }
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
                {(clip) => {
                    const picture = createMemo(() => drawn(clip))
                    return (
                        <div class="sg-c" style={{ left: `${clip.from * props.view.barWidth + 2}px`, width: `${Math.max(2, clip.length * props.view.barWidth - 3)}px` }}>
                            <Show when={props.view.barWidth >= 12}>
                                <svg
                                    viewBox={`0 0 ${Math.max(1, picture().bars) * UNIT} ${UNIT}`}
                                    preserveAspectRatio="none"
                                    aria-hidden="true"
                                    style={{ left: `${(picture().from - clip.from) * props.view.barWidth - 2}px`, width: `${picture().bars * props.view.barWidth}px` }}
                                >
                                    <path d={picture().path} fill={INK} />
                                </svg>
                            </Show>
                        </div>
                    )
                }}
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
    const paused = () => engineState().paused
    const head = () => (playing() || paused() ? (cycle() % length()) + position() : (loopBars()?.from ?? startBar()))

    // A click on a bar number starts the song from that bar. Dragging across numbers, or a
    // click with Shift held, chooses bars that go round. `picking` is the stretch being dragged.
    let pickedFrom: number | null = null
    let dragged = false
    const [picking, setPicking] = createSignal<{ from: number; to: number } | null>(null)
    const barAt = (event: PointerEvent) => {
        const box = scroller.getBoundingClientRect()
        return Math.max(0, Math.min(length() - 1, Math.floor((event.clientX - box.left + scroller.scrollLeft) / barWidth())))
    }
    const band = () => picking() ?? loopBars()
    const every = () => (barWidth() >= 22 ? 1 : barWidth() >= 9 ? 4 : 16)
    const wider = () => ZOOMS.find((px) => px > barWidth())
    const narrower = () => [...ZOOMS].reverse().find((px) => px < barWidth())

    onMount(() => {
        const watch = new ResizeObserver(() => setWidth(scroller.clientWidth))
        watch.observe(scroller)
        setWidth(scroller.clientWidth)
        onCleanup(() => watch.disconnect())
    })

    // The playlist turns the page when the playhead runs out of sight by itself. When it is out
    // of sight because the lanes were scrolled away to work on another part of the song, they
    // are left where they are until the playhead is in sight again.
    let following = true
    let lastLeft = 0
    let wasPlaying = false
    createEffect(() => {
        const seen = untrack(width)
        if (!playing() || !seen) {
            wasPlaying = false
            return
        }
        const at = head() * barWidth()
        const from = scroller.scrollLeft
        const visible = at >= from && at <= from + seen - 12
        if (visible || !wasPlaying) following = true
        else if (from !== lastLeft) following = false
        wasPlaying = true
        if (!visible && following) scroller.scrollLeft = Math.max(0, at - seen * 0.1)
        lastLeft = scroller.scrollLeft
    })

    return (
        <section class="sg" data-testid="song" onClick={(event) => event.stopPropagation()}>
            <div class="sg-h">
                <h3>Song</h3>
                <span class="lines" data-testid="song-length">
                    {length()} bars, {duration(length(), song().tempo?.bpm ?? bpm())}
                </span>
                <Show when={loopBars()}>
                    {(round) => (
                        <span class="sg-lp" data-testid="loop">
                            <span>{round().to - round().from === 1 ? `Bar ${round().from + 1} goes round` : `Bars ${round().from + 1} to ${round().to} go round`}</span>
                            <button class="chip tgl" disabled={stale()} title="Puts these bars in once more, straight after themselves" onClick={repeatLoop}>
                                Repeat them
                            </button>
                            <button class="rx" aria-label="Stop going round" onClick={clearLoop}>
                                <svg viewBox="0 0 8 8">
                                    <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
                                </svg>
                            </button>
                        </span>
                    )}
                </Show>
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
                        <Show when={band()}>
                            {(round) => <div class="sg-loop" data-testid="loop-band" style={{ left: `${round().from * barWidth()}px`, width: `${(round().to - round().from) * barWidth()}px` }} />}
                        </Show>
                        <div
                            class="sg-r"
                            style={{ left: `${view().first * barWidth()}px`, 'grid-template-columns': `repeat(${Math.max(0, view().last - view().first)}, ${barWidth()}px)` }}
                            onPointerDown={(event) => {
                                if (event.button !== 0) return
                                pickedFrom = barAt(event)
                                dragged = false
                                event.currentTarget.setPointerCapture(event.pointerId)
                            }}
                            onPointerMove={(event) => {
                                if (pickedFrom === null) return
                                const at = barAt(event)
                                if (at === pickedFrom && !dragged) return
                                dragged = true
                                setPicking({ from: Math.min(pickedFrom, at), to: Math.max(pickedFrom, at) + 1 })
                            }}
                            onPointerUp={(event) => {
                                const from = pickedFrom
                                pickedFrom = null
                                setPicking(null)
                                if (from === null) return
                                if (dragged) loopBetween(from, barAt(event))
                                else if (event.shiftKey) loopBetween(startBar(), from)
                                else startFrom(from)
                            }}
                            onPointerCancel={() => {
                                pickedFrom = null
                                setPicking(null)
                            }}
                        >
                            <Index each={Array.from({ length: Math.max(0, view().last - view().first) })}>
                                {(_, at) => {
                                    const bar = () => view().first + at
                                    return (
                                        <button
                                            classList={{ now: playing() && cycle() % length() === bar(), start: startBar() === bar() && bar() > 0, after: bar() >= length() }}
                                            aria-label={`Start from bar ${bar() + 1}`}
                                            aria-pressed={startBar() === bar()}
                                            disabled={bar() >= length()}
                                            onKeyDown={(event) => {
                                                if (event.key !== 'Enter' && event.key !== ' ') return
                                                event.preventDefault()
                                                if (event.shiftKey) loopBetween(startBar(), bar())
                                                else startFrom(bar())
                                            }}
                                        >
                                            {bar() % every() === 0 ? bar() + 1 : ''}
                                        </button>
                                    )
                                }}
                            </Index>
                        </div>
                        <For each={ids()}>{(id, index) => <Lane id={id} index={index()} view={view()} />}</For>
                        <div class="sg-end" data-testid="song-end" style={{ left: `${length() * barWidth()}px` }} />
                        <Show when={playing() || paused() || startBar() > 0 || loopBars()}>
                            <div class="sg-ph" classList={{ idle: !playing() }} style={{ left: `${head() * barWidth()}px` }} />
                        </Show>
                    </div>
                </div>
            </div>
        </section>
    )
}
