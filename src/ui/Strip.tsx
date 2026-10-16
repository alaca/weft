import { muteOrLearn, soloOrLearn } from '../app/knobs'
import { createEffect, createMemo, createSignal, For, Index, onCleanup, onMount, Show, untrack } from 'solid-js'
import { codeNow, addVariantOf, colorAt, dropOnPattern, duplicatePattern, eventsOf, movePattern, openSounds, removePattern, removeVariantOf, renamePattern, restsNow, select, setControl, setMix, showVariant, songLengthNow, togglePanel } from '../app/controller'
import { MOST_VARIANTS, variantBars, variantName } from '../song/variants'
import { writeNumber } from '../controls/catalog'
import { favourites, panOf, volumeOf, type ControlView } from '../controls/views'
import { isDrums, readKit } from '../song/kit'
import { readLaid } from '../song/audio'
import { readFollower } from '../song/chords'
import { readSlices } from '../song/slices'
import { noteText } from '../song/notes'
import type { PatternBlock, PatternView } from '../song/types'
import { describe, STEPS } from '../song/view'
import { fits, takesKit } from '../sounds/apply'
import { jamHand, jamPeer } from '../stores/jam'
import { cycle, draggedSound, engineState, openPanel, position, revision, selected, soloIds, song, stale, unfolded } from '../stores/song'
import { Knob } from './Knob'
import { MiniView } from './MiniView'
import { NoteRoll } from './NoteRoll'
import { PianoRoll } from './PianoRoll'
import { AudioRack } from './AudioRack'
import { ChordRack } from './ChordRack'
import { SliceRack } from './SliceRack'
import { SoundPanel } from './SoundPanel'
import { Rack } from './Rack'
import { askSoon } from './askSoon'
import { VaryMenu } from './VaryMenu'

// Every evaluation asks each pattern again what it plays. Most of the time the answer is the
// same, and saying so here spares the grid or roll below from being worked out again.
const sameView = (a: PatternView, b: PatternView) => JSON.stringify(a) === JSON.stringify(b)

const forcesSolo = (block: PatternBlock) => block.label.length > 1 && block.label.startsWith('S')

export function Strip(props: { id: string }) {
    const index = createMemo(() => song().patterns.findIndex((p) => p.id === props.id))
    const block = createMemo(() => song().patterns[index()])
    const resting = createMemo(() => restsNow(props.id))
    // Whether it plays is read from things that change with every change of the code, yet the
    // answer is nearly always the same. Kept as a yes or a no, it does not make the strip ask
    // its pattern again until the answer is another one.
    const playing = createMemo(() => engineState().playing && !block()?.muted && !resting())
    const panelOwner = () => openPanel()?.split('/')[0] ?? null
    const open = () => openPanel() === props.id
    const folded = () => panelOwner() !== null && panelOwner() !== props.id && !unfolded().includes(props.id)
    const soundOpen = createMemo(() => {
        const target = openPanel()
        if (!block() || panelOwner() !== props.id || target === props.id) return undefined
        return readKit(block())?.rows.find((row) => row.block.id === target)
    })

    // The bar that is drawn. While the strip plays it is the bar of the song, a frame or a few
    // late: at a new bar every playing strip would otherwise ask its pattern in the same frame,
    // and the song stands still for as long as that takes. So each waits for its turn, one in
    // sight before one that is scrolled away, and a folded one last. A grid or a roll of more
    // than one bar turns its page with this bar, not with the song's, so what one bar plays is
    // never laid over the steps of another.
    let inSight = true
    const sight = new IntersectionObserver((entries) => (inSight = entries[entries.length - 1].isIntersecting))
    const watch = (section: HTMLElement) => {
        sight.disconnect()
        sight.observe(section)
    }
    const [bar, setBar] = createSignal(untrack(() => (playing() ? cycle() : 0)))
    let turn = 0
    createEffect(() => {
        const next = playing() ? cycle() : 0
        const mine = ++turn
        if (next === untrack(bar)) return
        askSoon(
            () => {
                // When another bar has begun meanwhile, that one is waiting for its turn instead.
                if (mine === turn) setBar(next)
                return true
            },
            untrack(folded) ? 'folded' : inSight ? 'seen' : 'unseen',
        )
    })
    onCleanup(() => {
        turn++
        sight.disconnect()
    })

    let seenRows: string[] = []
    let seenAt = -1
    const view = createMemo((): PatternView => {
        const at = revision()
        const described = describe(eventsOf(props.id, bar()))
        if (at !== seenAt) {
            seenRows = []
            seenAt = at
        }
        if (described.kind === 'notes') return described
        const rows = described.kind === 'steps' ? described.rows : []
        for (const row of rows) if (!seenRows.includes(row.name)) seenRows.push(row.name)
        if (!seenRows.length) return { kind: 'empty' }
        return {
            kind: 'steps',
            rows: seenRows.map((name) => rows.find((row) => row.name === name) ?? { name, steps: Array<boolean>(STEPS).fill(false) }),
        }
    }, undefined, { equals: sameView })
    const steps = createMemo(() => {
        const current = view()
        return current.kind === 'steps' ? current : null
    })
    const notes = createMemo(() => {
        const current = view()
        return current.kind === 'notes' ? current : null
    })

    const isRoll = () => block() !== undefined && noteText(block()) !== null
    const isSliced = () => block() !== undefined && readSlices(block()) !== null
    const isFollower = () => block() !== undefined && readFollower(codeNow(), block()) !== null
    const isAudio = () => block() !== undefined && readLaid(block()) !== null
    const isRack = () => !isAudio() && !isSliced() && !isFollower() && !isRoll() && notes() === null && block() !== undefined && (steps() !== null || isDrums(block()))

    // Where the grid or the roll of this strip puts its length, steps and cycle.
    let head!: HTMLSpanElement
    const knobs = createMemo(() => (block() ? favourites(block()) : []))
    // How loud the pattern is and where it sits come first in the row of knobs under what it
    // plays. Neither has to be in the code to be turned: it stands where the sound engine puts
    // it by itself, and the first turn writes its line.
    const turnable = (view: ControlView): ControlView => (view.state === 'faint' ? { ...view, state: 'number', text: writeNumber(view.value, view.min, view.max) } : view)
    const mix = createMemo((): { fn: 'volume' | 'pan'; name: string; view: ControlView }[] =>
        block()
            ? [
                  { fn: 'volume', name: `Volume of ${props.id}`, view: turnable(volumeOf(block())) },
                  { fn: 'pan', name: `Pan of ${props.id}`, view: turnable(panOf(block())) },
              ]
            : [],
    )
    // The other knobs of the pattern stand in the row until its panel, which has them all, is open.
    const showKnobs = () => !open() && knobs().length > 0

    // The name can be typed over, and a small menu duplicates the pattern or moves it up or down.
    let more: HTMLSpanElement | undefined
    const [menu, setMenu] = createSignal(false)
    const [naming, setNaming] = createSignal(false)
    const [refused, setRefused] = createSignal(false)
    const place = () => song().patterns.findIndex((p) => p.id === props.id)
    const away = (event: PointerEvent) => {
        if (menu() && !more?.contains(event.target as Node)) setMenu(false)
    }
    onMount(() => document.addEventListener('pointerdown', away))
    onCleanup(() => document.removeEventListener('pointerdown', away))
    const rename = (input: HTMLInputElement) => {
        if (renamePattern(props.id, input.value)) setNaming(false)
        else setRefused(true)
    }

    // A sound dragged from the browser can be let go on a pattern that can take it.
    const [over, setOver] = createSignal(false)
    const takes = () => {
        const item = draggedSound()
        const here = block()
        return item !== null && here !== undefined && !stale() && fits(here, item.group)
    }

    return (
        <Show when={block()}>
            {(current) => (
                <section
                    ref={watch}
                    class="st"
                    classList={{ sel: selected() === props.id, muted: current().muted, rest: resting() }}
                    style={{ '--h': colorAt(index()) }}
                    data-testid={`strip-${props.id}`}
                    data-drop={over() && takes() ? '' : undefined}
                    onClick={() => select(props.id)}
                    onDragOver={(event) => {
                        if (!takes()) return
                        event.preventDefault()
                        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
                        setOver(true)
                    }}
                    onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false)
                    }}
                    onDrop={(event) => {
                        setOver(false)
                        const item = draggedSound()
                        if (!item || !takes()) return
                        event.preventDefault()
                        dropOnPattern(props.id, item)
                    }}
                >
                    <Show when={jamHand() === props.id}>
                        <span class="jm-hand" data-testid="jam-hand">
                            {jamPeer()}
                        </span>
                    </Show>
                    <div class="st-h">
                        <i class="bead-h" />
                        <Show
                            when={naming()}
                            fallback={
                                <b class="st-n" title="Double click to rename" onDblClick={() => !stale() && setNaming(true)}>
                                    {props.id}
                                </b>
                            }
                        >
                            <input
                                class="st-in"
                                aria-label={`New name for ${props.id}`}
                                aria-invalid={refused()}
                                title={refused() ? 'Another pattern has this name, or it is not a name a pattern can have' : undefined}
                                value={props.id}
                                maxLength={24}
                                ref={(input) => queueMicrotask(() => input.select())}
                                onClick={(event) => event.stopPropagation()}
                                onInput={() => setRefused(false)}
                                onBlur={(event) => naming() && rename(event.currentTarget)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') rename(event.currentTarget)
                                    else if (event.key === 'Escape') setNaming(false)
                                }}
                            />
                        </Show>
                        <button
                            class="chip tgl"
                            aria-label={`Change the sound of ${props.id}`}
                            title="Change the sound"
                            onClick={(event) => {
                                event.stopPropagation()
                                openSounds(props.id)
                            }}
                        >
                            {current().soundName ?? (takesKit(current()) ? 'Pick a kit' : 'Pick a sound')}
                        </button>
                        <Show when={current().variants}>
                            {(variants) => (
                                <span class="vr" role="group" aria-label={`Versions of ${props.id}`} onClick={(event) => event.stopPropagation()}>
                                    <Index each={variants().items}>
                                        {(_, at) => (
                                            <button
                                                classList={{ on: variants().shown === at, now: engineState().playing && variantBars(current(), songLengthNow())[cycle() % songLengthNow()] === at }}
                                                aria-label={`Version ${variantName(at)} of ${props.id}`}
                                                aria-pressed={variants().shown === at}
                                                title={`Version ${variantName(at)}: shown here, and what bars are filled with in the Song panel`}
                                                onClick={() => showVariant(props.id, at)}
                                            >
                                                {variantName(at)}
                                            </button>
                                        )}
                                    </Index>
                                    <button aria-label={`Add a version of ${props.id}`} title="One more version, a copy of the one shown" disabled={stale() || variants().items.length >= MOST_VARIANTS} onClick={() => addVariantOf(props.id)}>
                                        +
                                    </button>
                                </span>
                            )}
                        </Show>
                        <span class="st-g" ref={head} onClick={(event) => event.stopPropagation()} />
                        <Show when={folded()}>
                            <MiniView view={view()} />
                        </Show>
                        <span class="st-e">
                            <VaryMenu id={props.id} block={block()} />
                            <button
                                class="rs"
                                classList={{ on: open() }}
                                aria-label={`Sound controls for ${props.id}`}
                                aria-pressed={open()}
                                title="Sound controls"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    togglePanel(props.id)
                                }}
                            >
                                <svg viewBox="0 0 14 14" aria-hidden="true">
                                    <path d="M2 4.5h10M2 9.5h10" />
                                    <circle cx="5" cy="4.5" r="1.7" />
                                    <circle cx="9" cy="9.5" r="1.7" />
                                </svg>
                            </button>
                            <span class="ms">
                                <button
                                    classList={{ on: current().muted }}
                                    aria-label={`Mute ${props.id}`}
                                    aria-pressed={current().muted}
                                    disabled={stale()}
                                    onClick={(event) => {
                                        event.stopPropagation()
                                        muteOrLearn(props.id)
                                    }}
                                >
                                    M
                                </button>
                                <button
                                    classList={{ on: soloIds().includes(props.id) }}
                                    aria-label={`Solo ${props.id}`}
                                    aria-pressed={soloIds().includes(props.id)}
                                    disabled={stale()}
                                    onClick={(event) => {
                                        event.stopPropagation()
                                        soloOrLearn(props.id)
                                    }}
                                >
                                    S
                                </button>
                            </span>
                            <span class="st-more" ref={more} onClick={(event) => event.stopPropagation()}>
                                <button class="st-x" aria-label={`More for ${props.id}`} aria-haspopup="menu" aria-expanded={menu()} title="Rename, duplicate, move" disabled={stale()} onClick={() => setMenu(!menu())}>
                                    <svg viewBox="0 0 12 12" class="dots">
                                        <circle cx="2" cy="6" r="1.1" />
                                        <circle cx="6" cy="6" r="1.1" />
                                        <circle cx="10" cy="6" r="1.1" />
                                    </svg>
                                </button>
                                <Show when={menu()}>
                                    <div class="menu single" role="menu">
                                        <button
                                            role="menuitem"
                                            onClick={() => {
                                                setMenu(false)
                                                setRefused(false)
                                                setNaming(true)
                                            }}
                                        >
                                            Rename
                                        </button>
                                        <button
                                            role="menuitem"
                                            onClick={() => {
                                                setMenu(false)
                                                duplicatePattern(props.id)
                                            }}
                                        >
                                            Duplicate
                                        </button>
                                        <Show
                                            when={current().variants}
                                            fallback={
                                                <button
                                                    role="menuitem"
                                                    title="A second version of what this pattern plays, with the same sound and knobs, for another part of the song"
                                                    onClick={() => {
                                                        setMenu(false)
                                                        addVariantOf(props.id)
                                                    }}
                                                >
                                                    Add a version
                                                </button>
                                            }
                                        >
                                            {(variants) => (
                                                <button
                                                    role="menuitem"
                                                    onClick={() => {
                                                        setMenu(false)
                                                        removeVariantOf(props.id, variants().shown)
                                                    }}
                                                >
                                                    Remove version {variantName(variants().shown)}
                                                </button>
                                            )}
                                        </Show>
                                        <button
                                            role="menuitem"
                                            disabled={place() <= 0}
                                            onClick={() => {
                                                setMenu(false)
                                                movePattern(props.id, -1)
                                            }}
                                        >
                                            Move up
                                        </button>
                                        <button
                                            role="menuitem"
                                            disabled={place() >= song().patterns.length - 1}
                                            onClick={() => {
                                                setMenu(false)
                                                movePattern(props.id, 1)
                                            }}
                                        >
                                            Move down
                                        </button>
                                    </div>
                                </Show>
                            </span>
                            <button
                                class="st-x"
                                aria-label={`Remove the pattern ${props.id}`}
                                title="Remove this pattern"
                                disabled={stale()}
                                onClick={(event) => {
                                    event.stopPropagation()
                                    removePattern(props.id)
                                }}
                            >
                                <svg viewBox="0 0 8 8" aria-hidden="true">
                                    <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
                                </svg>
                            </button>
                        </span>
                    </div>
                    <Show when={!folded()}>
                        <div class="st-b two">
                            <div>
                                <Show when={isFollower()}>
                                    <ChordRack id={props.id} block={current()} head={head} playing={playing()} position={position()} cycle={bar()} />
                                </Show>
                                <Show when={isAudio()}>
                                    <AudioRack id={props.id} block={current()} playing={playing()} position={position()} cycle={bar()} />
                                </Show>
                                <Show when={isSliced()}>
                                    <SliceRack id={props.id} block={current()} head={head} playing={playing()} position={position()} cycle={bar()} />
                                </Show>
                                <Show when={isRack()}>
                                    <Rack id={props.id} block={current()} head={head} played={steps()?.rows ?? []} playing={playing()} position={position()} cycle={bar()} />
                                </Show>
                                <Show when={isRoll()}>
                                    <NoteRoll id={props.id} block={current()} head={head} played={notes()?.notes ?? []} playing={playing()} position={position()} cycle={bar()} />
                                </Show>
                                <Show when={!isRoll() && !isFollower() && !isAudio() && notes()}>
                                    {(roll) => (
                                        <>
                                            <PianoRoll lowest={roll().lowest} highest={roll().highest} notes={roll().notes} playing={playing()} position={position()} />
                                            <Show when={current().calls[0]?.name === 'n'}>
                                                <p class="rk-n">This pattern is written in scale steps. It is drawn here but cannot be edited by clicking yet.</p>
                                            </Show>
                                        </>
                                    )}
                                </Show>
                                <Show when={!isAudio() && !isSliced() && !isRack() && !isRoll() && view().kind === 'empty'}>
                                    <p class="st-empty">Nothing to draw. This pattern makes no sound in this cycle.</p>
                                </Show>
                            </div>
                            <div class="st-r" onClick={(event) => event.stopPropagation()}>
                                <For each={mix().map((knob) => knob.fn)}>
                                    {(fn) => <Show when={mix().find((knob) => knob.fn === fn)}>{(knob) => <Knob name={knob().name} of={props.id} view={knob().view} disabled={stale()} onChange={(value) => setMix(props.id, fn, value)} />}</Show>}
                                </For>
                                <Show when={showKnobs()}>
                                    <For each={knobs().map((knob) => knob.fn)}>
                                        {(fn) => (
                                            <Show when={knobs().find((knob) => knob.fn === fn)}>
                                                {(knob) => <Knob of={props.id} view={knob()} disabled={stale()} onChange={(value) => setControl(props.id, fn, value)} />}
                                            </Show>
                                        )}
                                    </For>
                                </Show>
                            </div>
                        </div>
                        <Show when={open()}>
                            <SoundPanel id={props.id} block={current()} />
                        </Show>
                        <Show when={soundOpen()}>{(row) => <SoundPanel id={row().block.id} block={row().block} only={row().sound} />}</Show>
                    </Show>
                    <Show when={forcesSolo(current())}>
                        <p class="st-note">Strudel treats a name that starts with a capital S as solo, so the other patterns are silent.</p>
                    </Show>
                </section>
            )}
        </Show>
    )
}
