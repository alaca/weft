import { batch, createEffect, createMemo, createSignal, For, Index, onCleanup, onMount, Show, untrack } from 'solid-js'
import { chooseScene, clearLoop, codeNow, colorAt, drawControl, drawTempo, eventsOf, inStep, keepSceneNow, loopBetween, nameScene, patternText, removeLoop, removeScene, repeatLoop, scenesOf, select, setBars, setCurve, setMix, setMotion, setTempoCurve, songLengthNow, spaceLoop, startFrom, stillTempo, takeKnobs, toggleBar, toggleMute, toggleSolo } from '../app/controller'
import { fromUnit, toUnit } from '../controls/catalog'
import { drawableIn, drawnIn, panOf, volumeOf, type ControlView } from '../controls/views'
import { barsOf, clips, paint, type Clip } from '../song/arrange'
import { MAX_BARS } from '../song/bars'
import type { PatternEvent } from '../song/types'
import { sceneIsOn, SCENE_NAME_LIMIT } from '../song/scenes'
import { barKeys, variantBars, variantName } from '../song/variants'
import { secondsOf, TEMPO_LEAST, TEMPO_MOST, type TempoLane } from '../song/tempo'
import { bpm, cycle, engineState, loopBars, playMode, position, revision, sceneWaiting, soloIds, song, stale, startBar, takingKnobs, tempoLane } from '../stores/song'
import { Knob } from './Knob'
import { MixStrips } from './MixStrips'
import { askSoon } from './askSoon'

// A clip shows what its pattern plays, bar by bar. The pattern is asked for no more bars than
// this: beyond them the drawing repeats, which is true of every pattern that is not random.
const DRAWN_BARS = 16
const UNIT = 100
const INK = 'rgba(22, 22, 24, 0.5)'

// A song can be thousands of bars long. Only the bars in sight, and a few on either side, are
// in the page; the rest is empty width to scroll through.
const ZOOMS = [6, 12, 24, 48, 96]
// Zoomed in, the rows are taller as well as the bars wider, a little: what a pattern plays
// is then drawn with room to read it. They are never lower than the knobs that stand in them.
const ROWS: Record<number, number> = { 48: 36, 96: 44 }
const rowHeight = (barWidth: number): number => ROWS[barWidth] ?? 30
const SPARE = 4
const EDGE = 28

// The song ends with its last filled bar. There are always this many empty bars after it, and
// never less than the width in sight, so there is room to fill the next ones.
const AFTER = 16
const IN_SIGHT = 20

// A pattern with versions plays differently from bar to bar, so its picture is drawn from
// more of its bars before it is taken to repeat.
const VERSION_BARS = 256

// The stretches of bars, from `from` up to `to`, that take the same version.
function runsOf(kinds: number[], from: number, to: number): { from: number; kind: number }[] {
    const runs: { from: number; kind: number }[] = []
    for (let bar = from; bar < to; bar++) if (bar === from || kinds[bar] !== kinds[bar - 1]) runs.push({ from: bar, kind: kinds[bar] ?? 0 })
    return runs
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i])

function duration(bars: number, tempo: number, lane: TempoLane | null = null): string {
    const seconds = Math.round(secondsOf(lane, bars, tempo))
    if (seconds < 100) return `${seconds} seconds`
    return `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}

type View = { length: number; shown: number; barWidth: number; first: number; last: number; scroller: () => HTMLDivElement }

// Asks a pattern what it plays in each bar that is drawn of it, and hands the answers on when
// all are there. The pattern is only asked when its text has changed since the last time:
// changing the bars of the song evaluates the code again but leaves every picture as it was.
function askBars(id: () => string, length: () => number, answered: (perBar: PatternEvent[][]) => void) {
    let drawnFrom: string | null = null
    let drawnBars = 0
    let asked = 0
    createEffect(() => {
        revision()
        const current = untrack(() => song().patterns.find((p) => p.id === id()))
        if (!current) return
        const count = Math.min(length(), current.variants ? VERSION_BARS : DRAWN_BARS)
        const text = untrack(() => patternText(id()))
        if (text === drawnFrom && drawnBars === count) return
        // Until the code has been evaluated the patterns still answer for the code before it,
        // which after opening another song is another song. Nothing is drawn from that.
        if (!untrack(inStep)) return
        drawnFrom = text
        drawnBars = count
        const mine = ++asked
        const perBar: PatternEvent[][] = []
        // A bar that is sure to play what a bar before it plays is not asked about: it takes
        // that bar's answer.
        const keys = barKeys(current, count, DRAWN_BARS)
        const answers = new Map<string, PatternEvent[]>()
        askSoon(() => {
            // Something changed again meanwhile, and that is being asked about instead.
            if (mine !== asked) return true
            if (perBar.length < count) answers.set(keys[perBar.length], eventsOf(id(), perBar.length))
            while (perBar.length < count && answers.has(keys[perBar.length])) perBar.push(answers.get(keys[perBar.length])!)
            if (perBar.length < count) return false
            answered(perBar)
            return true
        })
    })
    onCleanup(() => asked++)
}

// The files of the drums a pattern plays are fetched from what it answers when it is asked,
// long before they are due. With the Song panel put away its rows are not there to ask, so the
// patterns are asked about the same bars here, and nothing is drawn.
export function AskedAhead() {
    const ids = createMemo(() => [...new Set(song().patterns.map((p) => p.id))], [] as string[], { equals: sameList })
    const length = createMemo(() => songLengthNow())
    return (
        <For each={ids()}>
            {(id) => {
                askBars(
                    () => id,
                    length,
                    () => undefined,
                )
                return null
            }}
        </For>
    )
}

function Lane(props: { id: string; index: number; view: View }) {
    let track!: HTMLDivElement
    let drag: { from: number; on: boolean; x: number; low: number; high: number } | null = null
    let creep = 0
    const block = () => song().patterns.find((p) => p.id === props.id)
    // For a pattern with versions: which one each bar takes, and the one that bars are filled with.
    const kinds = createMemo(() => {
        const current = block()
        return current?.variants ? variantBars(current, props.view.shown) : null
    })
    const brush = () => block()?.variants?.shown ?? 0
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

    type Played = { perBar: PatternEvent[][]; low: number; high: number; sounds: (string | null)[] }
    const [played, setPlayed] = createSignal<Played>({ perBar: [], low: 0, high: 0, sounds: [] })
    askBars(
        () => props.id,
        () => props.view.length,
        (perBar) => {
            const pitches = perBar.flat().flatMap((event) => (event.midi === null ? [] : [event.midi]))
            setPlayed({
                perBar,
                low: Math.min(...pitches),
                high: Math.max(...pitches),
                sounds: [...new Set(perBar.flat().map((event) => event.sound))],
            })
        },
    )

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
        if (!drag) return
        const to = barAt(drag.x)
        drag.low = Math.min(drag.from, to)
        drag.high = Math.max(drag.from, to)
        setDraft(paint(written(), drag.from, to, drag.on))
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
        // A bar that plays another version than the one in sight is not emptied: it takes this one.
        const other = kinds() !== null && kinds()![bar] !== brush()
        drag = { from: bar, on: !written()[bar] || other, x: event.clientX, low: bar, high: bar }
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
        const painted = drag.on && kinds() ? { from: drag.low, to: drag.high } : undefined
        drag = null
        batch(() => {
            if (keep && next) setBars(props.id, next, painted)
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
                            <Show when={kinds() && props.view.barWidth >= 12}>
                                <For each={runsOf(kinds() ?? [], Math.max(clip.from, props.view.first), Math.min(clip.from + clip.length, props.view.last))}>
                                    {(run) => (
                                        <b class="sg-vl" style={{ left: `${(run.from - clip.from) * props.view.barWidth}px` }}>
                                            {variantName(run.kind)}
                                        </b>
                                    )}
                                </For>
                            </Show>
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

// A control drawn over the song: one column to a bar, as high as the control is in that bar.
// Dragging draws it, a bar at a time under the pointer; with Shift held it is a straight line
// from where the drag began, which is how something opens or closes over a stretch of bars.
const KEYS: Record<string, number> = { ArrowUp: 0.02, ArrowDown: -0.02, PageUp: 0.1, PageDown: -0.1 }

// What a lane draws when it is not a knob of a pattern: what it is, and how it is written.
type Drawn = { control: () => ControlView | undefined; write: (values: number[], held?: boolean) => void; hue: string }

function CurveLane(props: { id: string; fn: string; index: number; view: View; drawn?: Drawn }) {
    let track!: HTMLDivElement
    let drag: { from: number; start: number; last: number } | null = null
    const control = createMemo(() => {
        if (props.drawn) return props.drawn.control()
        const block = song().patterns.find((p) => p.id === props.id)
        return block ? drawnIn(block).find((view) => view.fn === props.fn) : undefined
    })
    const write = (values: number[], held = false) => (props.drawn ? props.drawn.write(values, held) : setCurve(props.id, props.fn, values, held))
    const written = createMemo(() => {
        const curve = control()?.curve
        return curve?.length ? Array.from({ length: props.view.length }, (_, bar) => curve[bar % curve.length]) : []
    })
    const [draft, setDraft] = createSignal<number[] | null>(null)
    const values = () => draft() ?? written()
    const cells = () => Array.from({ length: Math.max(0, props.view.last - props.view.first) })
    const unitOf = (value: number | undefined) => {
        const now = control()
        return now && value !== undefined ? toUnit(value, now.min, now.max, now.scale) : 0
    }
    const valueOf = (unit: number) => {
        const now = control()
        return now ? fromUnit(Math.min(1, Math.max(0, unit)), now.min, now.max, now.scale) : 0
    }
    const barAt = (x: number) => Math.min(props.view.length - 1, Math.max(0, Math.floor((x - track.getBoundingClientRect().left) / props.view.barWidth)))
    const unitAt = (y: number) => {
        const box = track.getBoundingClientRect()
        return Math.min(1, Math.max(0, 1 - (y - box.top - 3) / Math.max(1, box.height - 6)))
    }
    const sweep = (event: PointerEvent) => {
        if (!drag) return
        const bar = barAt(event.clientX)
        const unit = unitAt(event.clientY)
        if (event.shiftKey) {
            const next = [...written()]
            const span = bar - drag.from
            for (let at = Math.min(drag.from, bar); at <= Math.max(drag.from, bar); at++) next[at] = valueOf(span ? drag.start + ((unit - drag.start) * (at - drag.from)) / span : unit)
            setDraft(next)
        } else {
            const next = [...values()]
            for (let at = Math.min(drag.last, bar); at <= Math.max(drag.last, bar); at++) next[at] = valueOf(unit)
            setDraft(next)
        }
        drag.last = bar
    }
    const finish = (keep: boolean) => {
        const next = draft()
        if (!drag) return
        drag = null
        batch(() => {
            if (keep && next) write(next)
            setDraft(null)
        })
    }
    const nudge = (bar: number, unit: number, held: boolean) => write(written().map((value, at) => (at === bar ? valueOf(unit) : value)), held)

    return (
        <div
            class="sg-l sg-k"
            ref={track}
            style={{ '--h': props.drawn?.hue ?? colorAt(props.index) }}
            data-testid={`curve-${props.id}-${props.fn}`}
            onPointerDown={(event) => {
                // Past the last bar of the song there is nothing to draw on.
                const bar = Math.floor((event.clientX - track.getBoundingClientRect().left) / props.view.barWidth)
                if (stale() || event.button !== 0 || !control() || bar < 0 || bar >= props.view.length) return
                drag = { from: bar, start: unitAt(event.clientY), last: bar }
                track.setPointerCapture(event.pointerId)
                sweep(event)
            }}
            onPointerMove={sweep}
            onPointerUp={() => finish(true)}
            onPointerCancel={() => finish(false)}
        >
            <div class="sg-cells" style={{ left: `${props.view.first * props.view.barWidth}px`, 'grid-template-columns': `repeat(${cells().length}, ${props.view.barWidth}px)` }}>
                <Index each={cells()}>
                    {(_, at) => {
                        const bar = () => props.view.first + at
                        return (
                            <Show when={bar() < props.view.length} fallback={<span />}>
                                <div
                                    class="sg-v"
                                    role="slider"
                                    tabindex="0"
                                    aria-label={`${props.drawn ? '' : `${props.id} `}${control()?.label ?? props.fn} in bar ${bar() + 1}`}
                                    aria-valuemin={control()?.min}
                                    aria-valuemax={control()?.max}
                                    aria-valuenow={values()[bar()]}
                                    aria-disabled={stale() ? 'true' : 'false'}
                                    title={`Bar ${bar() + 1}: ${values()[bar()]}`}
                                    onKeyDown={(event) => {
                                        if (stale()) return
                                        if (event.key === 'Home') nudge(bar(), 0, event.repeat)
                                        else if (event.key === 'End') nudge(bar(), 1, event.repeat)
                                        else if (event.key in KEYS) nudge(bar(), unitOf(written()[bar()]) + KEYS[event.key], event.repeat)
                                        else return
                                        event.preventDefault()
                                    }}
                                >
                                    <i style={{ height: `${Math.round(unitOf(values()[bar()]) * 1000) / 10}%` }} />
                                </div>
                            </Show>
                        )
                    }}
                </Index>
            </div>
        </div>
    )
}

// The name of a pattern with what is reached for most while a song is arranged: whether it
// plays, whether only it plays, how loud it is and where it sits. They are the same switches
// and knobs the pattern has on its strip. Beside them is the way to draw one of its knobs over
// the song, and under the name a row for every knob that is drawn.
function NameRows(props: { id: string; index: number }) {
    let row: HTMLDivElement | undefined
    const block = () => song().patterns.find((p) => p.id === props.id)
    const drawable = createMemo(() => {
        const now = block()
        return now ? drawableIn(now) : []
    })
    const drawn = createMemo(() => {
        const now = block()
        return now ? drawnIn(now) : []
    })
    const mix = createMemo((): { fn: 'volume' | 'pan'; name: string; view: ControlView }[] => {
        const now = block()
        return now
            ? [
                  { fn: 'volume', name: `Volume of ${props.id}`, view: volumeOf(now) },
                  { fn: 'pan', name: `Pan of ${props.id}`, view: panOf(now) },
              ]
            : []
    })
    const [choosing, setChoosing] = createSignal(false)
    const away = (event: PointerEvent) => {
        if (choosing() && !row?.contains(event.target as Node)) setChoosing(false)
    }
    const escape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') setChoosing(false)
    }
    onMount(() => {
        document.addEventListener('pointerdown', away)
        document.addEventListener('keydown', escape)
    })
    onCleanup(() => {
        document.removeEventListener('pointerdown', away)
        document.removeEventListener('keydown', escape)
    })
    return (
        <>
            <div class="sg-nr" ref={row} style={{ '--h': colorAt(props.index) }}>
                <span class="ms">
                    <button classList={{ on: block()?.muted }} aria-label={`Mute ${props.id}`} aria-pressed={block()?.muted ?? false} disabled={stale()} onClick={() => toggleMute(props.id)}>
                        M
                    </button>
                    <button classList={{ on: soloIds().includes(props.id) }} aria-label={`Solo ${props.id}`} aria-pressed={soloIds().includes(props.id)} onClick={() => toggleSolo(props.id)}>
                        S
                    </button>
                </span>
                <button
                    class="sg-n"
                    classList={{ muted: block()?.muted }}
                    aria-label={`Go to ${props.id}`}
                    onClick={() => {
                        select(props.id)
                        document.querySelector(`[data-testid="strip-${props.id}"]`)?.scrollIntoView({ block: 'nearest' })
                    }}
                >
                    <i />
                    <span>{props.id}</span>
                </button>
                <span class="mix">
                    <For each={mix().map((knob) => knob.fn)}>
                        {(fn) => <Show when={mix().find((knob) => knob.fn === fn)}>{(knob) => <Knob small name={knob().name} view={knob().view} disabled={stale()} onChange={(value) => setMix(props.id, fn, value)} />}</Show>}
                    </For>
                </span>
                <button
                    class="sg-dr"
                    aria-label={`Draw a knob of ${props.id} over the song`}
                    aria-haspopup="menu"
                    aria-expanded={choosing()}
                    disabled={stale() || !drawable().length}
                    title={drawable().length ? 'Draw one of its knobs over the song, bar by bar' : drawn().length ? 'Every knob it has is drawn already' : 'It has no knob to draw yet. Add one in its panel first.'}
                    onClick={() => setChoosing(!choosing())}
                >
                    <svg viewBox="0 0 12 10" aria-hidden="true">
                        <path d="M1 8.5h2.2V5.4h2.3V2h2.3v3.4h2.2" />
                    </svg>
                </button>
                <Show when={choosing()}>
                    <div class="menu single sg-dm" role="menu" aria-label={`Knobs of ${props.id}`}>
                        <For each={drawable()}>
                            {(view) => (
                                <button
                                    role="menuitem"
                                    onClick={() => {
                                        setChoosing(false)
                                        drawControl(props.id, view.fn)
                                    }}
                                >
                                    {view.label}
                                </button>
                            )}
                        </For>
                    </div>
                </Show>
            </div>
            <For each={drawn().map((view) => view.fn)}>
                {(fn) => {
                    const label = () => drawn().find((view) => view.fn === fn)?.label ?? fn
                    return (
                        <div class="sg-kn" style={{ '--h': colorAt(props.index) }} data-testid={`curve-name-${props.id}-${fn}`}>
                            <span title={drawn().find((view) => view.fn === fn)?.text}>{label()}</span>
                            <button class="rx" aria-label={`Let ${label()} of ${props.id} stand still again`} title="Stand still again" disabled={stale()} onClick={() => setMotion(props.id, fn, null)}>
                                <svg viewBox="0 0 8 8">
                                    <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
                                </svg>
                            </button>
                        </div>
                    )
                }}
            </For>
        </>
    )
}

function Lanes(props: { id: string; index: number; view: View }) {
    const fns = createMemo(
        () => {
            const block = song().patterns.find((p) => p.id === props.id)
            return block ? drawnIn(block).map((view) => view.fn) : []
        },
        [] as string[],
        { equals: sameList },
    )
    return (
        <>
            <Lane id={props.id} index={props.index} view={props.view} />
            <For each={fns()}>{(fn) => <CurveLane id={props.id} fn={fn} index={props.index} view={props.view} />}</For>
        </>
    )
}

// The scenes of the song as a row of switches, for playing it live: one press and the patterns
// of that scene are the ones that play, from the next bar on. A double click on a name changes it.
function Scenes() {
    const scenes = createMemo(() => {
        song()
        return scenesOf(codeNow())
    })
    const [naming, setNaming] = createSignal<string | null>(null)
    // The scene that already keeps exactly what plays now, when there is one: keeping it again
    // would make a second scene that does nothing the first does not.
    const same = () => scenes().find((scene) => sceneIsOn(song().patterns, scene))?.name
    return (
        <div class="sg-sc" data-testid="scenes">
            <span class="cap">Scenes</span>
            <For each={scenes().map((scene) => scene.name)}>
                {(name) => {
                    const scene = () => scenes().find((one) => one.name === name)
                    const on = () => {
                        const now = scene()
                        return now ? sceneIsOn(song().patterns, now) : false
                    }
                    return (
                        <Show
                            when={naming() !== name}
                            fallback={
                                <input
                                    class="sg-si"
                                    aria-label={`Name of the scene ${name}`}
                                    value={name}
                                    maxLength={SCENE_NAME_LIMIT}
                                    ref={(input) => queueMicrotask(() => input.select())}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Escape') setNaming(null)
                                        if (event.key !== 'Enter') return
                                        nameScene(name, event.currentTarget.value)
                                        setNaming(null)
                                    }}
                                    onBlur={() => setNaming(null)}
                                />
                            }
                        >
                            <span class="sg-sn">
                                <button
                                    class="chip tgl"
                                    classList={{ on: on(), wait: sceneWaiting() === name }}
                                    aria-pressed={on()}
                                    disabled={stale()}
                                    title={sceneWaiting() === name ? 'Comes in on the first beat of a bar' : `Plays ${scene()?.on.join(', ') || 'nothing'}. Double click to change the name.`}
                                    onClick={() => chooseScene(name)}
                                    onDblClick={() => !stale() && setNaming(name)}
                                >
                                    {name}
                                </button>
                                <button class="rx" aria-label={`Remove the scene ${name}`} disabled={stale()} onClick={() => removeScene(name)}>
                                    <svg viewBox="0 0 8 8">
                                        <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
                                    </svg>
                                </button>
                            </span>
                        </Show>
                    )
                }}
            </For>
            <button class="addb" disabled={stale() || same() !== undefined} title="Keeps the patterns that play now as a scene, to come back to with one press" onClick={keepSceneNow}>
                + Keep what plays now
            </button>
            <Show when={same()} fallback={<Show when={!scenes().length}>{<span class="sg-lp">Mute the patterns that should rest with M, then keep that as a scene.</span>}</Show>}>
                <span class="sg-lp">This is {same()}. Mute or unmute a pattern with M to keep another.</span>
            </Show>
        </div>
    )
}

// The tempo of every bar as something a lane draws, the way it draws a knob.
const tempoDrawn: Drawn = {
    hue: 'var(--linen-2)',
    control: () => {
        const lane = tempoLane()
        if (!lane) return undefined
        const low = Math.min(...lane.values)
        const high = Math.max(...lane.values)
        return { fn: 'tempo', label: 'Tempo', group: 'pattern', describe: 'The tempo of every bar', state: 'drawn', curve: lane.values, value: high, min: TEMPO_LEAST, max: TEMPO_MOST, scale: 'linear', text: low === high ? `${high} bpm` : `${low} to ${high} bpm` }
    },
    write: (values, held) => setTempoCurve(values, held),
}

export function SongPanel() {
    let scroller!: HTMLDivElement
    // The patterns are shown as the bars they play in, or side by side as the strips of a mixer.
    const [mixing, setMixing] = createSignal(false)
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
    // Whether no pattern plays in any bar of the song.
    const nothingIn = () => song().patterns.length > 0 && song().patterns.every((block) => !barsOf(block, length()).some(Boolean))
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
                <div class="seg s sg-sw" role="group" aria-label="What the song panel shows">
                    <button classList={{ on: !mixing() }} aria-pressed={!mixing()} title="The bars each pattern plays in" onClick={() => setMixing(false)}>
                        Bars
                    </button>
                    <button classList={{ on: mixing() }} aria-pressed={mixing()} title="A strip for each pattern: how loud it is, where it sits, what it cuts off, and how much of it goes to the room and the echo" onClick={() => setMixing(true)}>
                        Mix
                    </button>
                </div>
                <span class="lines" data-testid="song-length">
                    {length()} bars, {duration(length(), song().tempo?.bpm ?? bpm(), playMode() === 'song' ? tempoLane() : null)}
                </span>
                <Show when={playMode() === 'live'}>
                    <span class="sg-lp" data-testid="live-note">
                        Live: every pattern plays, the bars are not followed
                    </span>
                </Show>
                <Show when={playMode() === 'song' && nothingIn()}>
                    <span class="sg-lp" data-testid="empty-note">
                        Nothing is in the song yet. Fill bars for a pattern below, or switch to Live to hear every pattern.
                    </span>
                </Show>
                <Show when={playMode() === 'song' ? loopBars() : null}>
                    {(round) => (
                        <span class="sg-lp" data-testid="loop">
                            <span>{round().to - round().from === 1 ? `Bar ${round().from + 1} goes round` : `Bars ${round().from + 1} to ${round().to} go round`}</span>
                            <button class="chip tgl" disabled={stale()} title="Puts these bars in once more, straight after themselves" onClick={repeatLoop}>
                                Repeat them
                            </button>
                            <button class="chip tgl" disabled={stale()} title="Puts as many empty bars in before these, in every pattern" onClick={spaceLoop}>
                                Empty bars before
                            </button>
                            <button class="chip tgl" disabled={stale() || round().to - round().from >= length()} title="Takes these bars out of the song, in every pattern" onClick={removeLoop}>
                                Take them out
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
                <Show when={playMode() === 'song' && !tempoLane()}>
                    <button class="chip tgl" classList={{ away: mixing() }} disabled={stale() || song().tempoLocked} title="Gives every bar a tempo of its own, drawn over the song the way a knob is: for a song that speeds up, slows down or changes tempo" onClick={drawTempo}>
                        Draw the tempo
                    </button>
                </Show>
                <button
                    class="chip tgl tk"
                    classList={{ on: takingKnobs() }}
                    aria-pressed={takingKnobs()}
                    title="While this is on, a knob you turn as the song plays is drawn over the song, bar by bar, when the song stops"
                    onClick={() => takeKnobs(!takingKnobs())}
                >
                    <i />
                    Record knobs
                </button>
                <span class="cap" classList={{ away: mixing() }}>Zoom</span>
                <div class="seg s" classList={{ away: mixing() }}>
                    <button aria-label="Show more bars" disabled={narrower() === undefined} onClick={() => setZoom(narrower() ?? barWidth())}>
                        -
                    </button>
                    <button aria-label="Show fewer bars" disabled={wider() === undefined} onClick={() => setZoom(wider() ?? barWidth())}>
                        +
                    </button>
                </div>
            </div>
            <Show when={playMode() === 'live' && song().patterns.length > 0}>
                <Scenes />
            </Show>
            <Show when={mixing()}>
                <MixStrips />
            </Show>
            <div class="sg-g" classList={{ away: mixing() }} style={{ '--row': `${rowHeight(barWidth())}px` }}>
                <div class="sg-names">
                    <div class="sg-nh" aria-hidden="true">
                        <span>Vol</span>
                        <span>Pan</span>
                    </div>
                    <Show when={playMode() === 'song' && tempoLane()}>
                        <div class="sg-kn sg-tn" data-testid="tempo-name">
                            <span title="The tempo of every bar, in beats a minute. Drag to draw it, with Shift held for a straight line.">Tempo</span>
                            <button class="rx" aria-label="One tempo for the whole song again" title="One tempo for the whole song again" disabled={stale()} onClick={stillTempo}>
                                <svg viewBox="0 0 8 8">
                                    <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
                                </svg>
                            </button>
                        </div>
                    </Show>
                    <For each={ids()}>{(id, index) => <NameRows id={id} index={index()} />}</For>
                </div>
                <div class="sg-s" ref={scroller} data-testid="song-scroll" onScroll={() => setLeft(scroller.scrollLeft)}>
                    <div class="sg-t" classList={{ dense: barWidth() < 12, aside: playMode() === 'live' }} style={{ width: `${shown() * barWidth()}px`, '--bar': `${barWidth()}px` }}>
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
                        <Show when={playMode() === 'song' && tempoLane()}>
                            <CurveLane id="Tempo" fn="tempo" index={0} view={view()} drawn={tempoDrawn} />
                        </Show>
                        <For each={ids()}>{(id, index) => <Lanes id={id} index={index()} view={view()} />}</For>
                        <div class="sg-end" data-testid="song-end" style={{ left: `${length() * barWidth()}px` }} />
                        <Show when={playMode() === 'song' && (playing() || paused() || startBar() > 0 || loopBars())}>
                            <div class="sg-ph" classList={{ idle: !playing() }} style={{ left: `${head() * barWidth()}px` }} />
                        </Show>
                    </div>
                </div>
            </div>
        </section>
    )
}
