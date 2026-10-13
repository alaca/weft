import { createMemo, createSignal, For, Show } from 'solid-js'
import { addRow, canWriteDrums, clearStepValues, paintSteps, previewSound, removeGridRow, setLength, setMix, setStepsPerCycle, setStepValues, soundChoices, toggleAccent, togglePanel, toggleRowMute, toggleStep } from '../app/controller'
import { drumLabel } from '../controls/drums'
import { callFor, panOf, valueArg, volumeOf } from '../controls/views'
import { DRUM_RESOLUTIONS, readGrid, resample, STEP_KINDS, stepKind, stepValues, type Grid, type StepWhat } from '../song/grid'
import { isDrums, readKit, rowTarget } from '../song/kit'
import type { PatternBlock } from '../song/types'
import { drumSteps, USUAL } from '../song/meter'
import { hearKeyboards } from '../app/piano'
import { gridNotes, meter, midiKeyboards, openPanel, pianoFor, pianoWrites, setPianoFor, setPianoWrites, stale } from '../stores/song'
import { GridFooter } from './GridFooter'
import { Knob } from './Knob'
import { StepGrid, type ShownLane, type StepRow } from './StepGrid'

const NO_CONTROLS: PatternBlock = { id: '', label: '', muted: false, labelFrom: 0, labelTo: 0, from: 0, to: 0, lineFrom: 0, lineTo: 0, soundName: null, calls: [] }

function RowControls(props: { id: string; sound: string; block: PatternBlock | undefined; muted: boolean; stepped: boolean; onSteps: () => void }) {
    const target = () => rowTarget(props.id, props.sound)
    const name = () => drumLabel(props.sound)
    return (
        <span class="rc">
            <button class="rm" classList={{ on: props.muted }} aria-label={`Mute ${props.sound}`} aria-pressed={props.muted} title={`Mute ${name()} only`} disabled={stale()} onClick={() => toggleRowMute(props.id, props.sound)}>
                M
            </button>
            <Knob small name={`Volume of ${props.sound}`} of={target()} view={volumeOf(props.block ?? NO_CONTROLS)} disabled={stale()} onChange={(value) => setMix(target(), 'volume', value)} />
            <Knob small name={`Pan of ${props.sound}`} of={target()} view={panOf(props.block ?? NO_CONTROLS)} disabled={stale()} onChange={(value) => setMix(target(), 'pan', value)} />
            <button
                class="rs"
                classList={{ on: openPanel() === target() }}
                aria-label={`Sound controls for ${props.sound}`}
                aria-pressed={openPanel() === target()}
                title={`Controls for ${name()} only`}
                disabled={stale()}
                onClick={() => togglePanel(target())}
            >
                <svg viewBox="0 0 14 14" aria-hidden="true">
                    <path d="M2 4.5h10M2 9.5h10" />
                    <circle cx="5" cy="4.5" r="1.7" />
                    <circle cx="9" cy="9.5" r="1.7" />
                </svg>
            </button>
            <button
                class="rs"
                classList={{ on: props.stepped }}
                aria-label={`Step by step for ${props.sound}`}
                aria-pressed={props.stepped}
                title={`Give each hit of ${name()} a level, a chance, repeats and more of its own`}
                disabled={stale()}
                onClick={props.onSteps}
            >
                <svg viewBox="0 0 14 14" aria-hidden="true">
                    <path d="M2.5 11.5v-4M5.5 11.5v-8M8.5 11.5v-6M11.5 11.5v-3" />
                </svg>
            </button>
        </span>
    )
}

export function Rack(props: { id: string; block: PatternBlock; head: HTMLElement; played: { name: string; steps: boolean[] }[]; playing: boolean; position: number; cycle: number }) {
    const [page, setPage] = createSignal(0)
    const [menu, setMenu] = createSignal(false)
    const kit = createMemo(() => readKit(props.block))
    const grid = createMemo((): Grid | null => kit() ?? readGrid(props.block)?.grid ?? null)
    const canEdit = createMemo(() => isDrums(props.block))
    const mutedRows = createMemo(() => (kit()?.rows ?? []).flatMap((row) => (row.muted ? [row.sound] : [])))
    const cycles = () => grid()?.cycles ?? 1
    const perCycle = () => grid()?.perCycle ?? props.played[0]?.steps.length ?? 16
    // While a run of steps is dragged the bar in sight stays, though the song goes on to the next.
    const [held, setHeld] = createSignal<number | null>(null)
    const shown = () => Math.min(held() ?? (props.playing ? props.cycle % cycles() : page()), cycles() - 1)
    // A bar that is held in sight while the song plays another one is not compared with what
    // the song plays, and the light of the step that sounds does not run over it.
    const inSight = () => shown() === props.cycle % cycles()

    const rows = createMemo((): StepRow[] => {
        const current = grid()
        const from = shown() * perCycle()
        const comparable = props.playing && perCycle() === 16
        const placed: StepRow[] = current
            ? current.rows.map((row) => {
                  const steps = row.steps.slice(from, from + perCycle())
                  const accents = row.accents?.slice(from, from + perCycle())
                  const repeats = row.repeats?.slice(from, from + perCycle())
                  const chances = row.chances?.slice(from, from + perCycle())
                  const heard = props.played.find((other) => other.name === row.sound)?.steps
                  const muted = mutedRows().includes(row.sound)
                  return { name: row.sound, steps, accents, repeats, chances, muted, played: comparable && inSight() && !muted ? (heard ?? steps.map(() => false)) : undefined }
              })
            : props.played.map((row) => ({ name: row.name, steps: row.steps }))
        const extra = current && comparable ? props.played.filter((row) => !placed.some((other) => other.name === row.name)) : []
        return [...placed, ...extra.map((row) => ({ name: row.name, steps: row.steps.map(() => false), played: inSight() ? row.steps : undefined }))]
    })

    // One row at a time shows what its steps have of their own, one thing at a time.
    const [stepped, setStepped] = createSignal<{ sound: string; what: StepWhat } | null>(null)
    // What stands over the bars is made once and stays while they are drawn over.
    const head = (
        <Show when={stepped()}>
            {(open) => (
                <>
                    <div class="seg s" role="group" aria-label={`What each step of ${open().sound} has of its own`}>
                        <For each={STEP_KINDS}>
                            {(each) => (
                                <button classList={{ on: each.what === open().what }} aria-pressed={each.what === open().what} title={each.about} onClick={() => setStepped({ sound: open().sound, what: each.what })}>
                                    {each.label}
                                </button>
                            )}
                        </For>
                    </div>
                    <span class="ln-a">{stepKind(open().what).about}. Drag over the bars. Double click one to put it back.</span>
                    <button
                        class="chip tgl"
                        disabled={stale()}
                        title={`Every hit of ${open().sound} as it was, with no ${stepKind(open().what).label.toLowerCase()} of its own`}
                        onClick={() => clearStepValues(props.id, open().sound, open().what)}
                    >
                        Clear
                    </button>
                </>
            )}
        </Show>
    )
    const lane = createMemo((): ShownLane | undefined => {
        const open = stepped()
        const current = grid()
        const row = open ? current?.rows.find((each) => each.sound === open.sound) : undefined
        if (!open || !row || !canEdit()) return undefined
        const kind = stepKind(open.what)
        const own = kit()?.rows.find((each) => each.sound === open.sound)?.block
        // Until a step has a value of its own, every step has what the row's knob stands on.
        const knob = kind.fn && own ? valueArg(callFor(own, kind.fn))?.value : undefined
        const from = shown() * perCycle()
        return {
            sound: open.sound,
            kind,
            values: stepValues(row, open.what, knob).slice(from, from + perCycle()),
            onDraw: (at, values) => setStepValues(props.id, open.sound, open.what, from + at, values),
            head,
        }
    })

    const choices = () => soundChoices(props.id, rows().map((row) => row.name))
    return (
        <div class="rk" onClick={(event) => event.stopPropagation()}>
            <Show when={rows().length} fallback={<p class="st-empty">No sounds yet. Add one below.</p>}>
                <StepGrid
                    rows={rows()}
                    playing={props.playing && inSight()}
                    position={props.position}
                    disabled={stale()}
                    onToggle={canEdit() ? (sound, step) => toggleStep(props.id, sound, shown() * perCycle() + step) : undefined}
                    onPaint={canEdit() ? (sound, from, to, on) => paintSteps(props.id, sound, shown() * perCycle() + from, shown() * perCycle() + to, on) : undefined}
                    canPaint={() => grid() !== null || canWriteDrums(props.id)}
                    onHold={(on) => setHeld(on ? shown() : null)}
                    onAccent={canEdit() ? (sound, step) => toggleAccent(props.id, sound, shown() * perCycle() + step) : undefined}
                    onHear={(sound) => previewSound(props.id, sound)}
                    onRemove={canEdit() ? (sound) => removeGridRow(props.id, sound) : undefined}
                    lane={lane()}
                    controls={
                        canEdit()
                            ? (sound) => (
                                  <RowControls
                                      id={props.id}
                                      sound={sound()}
                                      block={kit()?.rows.find((row) => row.sound === sound())?.block}
                                      muted={mutedRows().includes(sound())}
                                      stepped={stepped()?.sound === sound()}
                                      onSteps={() => setStepped(stepped()?.sound === sound() ? null : { sound: sound(), what: stepped()?.what ?? 'level' })}
                                  />
                              )
                            : undefined
                    }
                />
            </Show>
            <Show when={canEdit()}>
                <GridFooter
                    head={props.head}
                    cycles={cycles()}
                    perCycle={perCycle()}
                    resolutions={meter() === USUAL ? DRUM_RESOLUTIONS : drumSteps(meter())}
                    canUse={(resolution) => {
                        const current = grid()
                        return !current || resample(current, resolution) !== null
                    }}
                    shown={shown()}
                    disabled={stale()}
                    onPage={setPage}
                    onLength={(length) => {
                        setPage(0)
                        setLength(props.id, length)
                    }}
                    onSteps={(resolution) => setStepsPerCycle(props.id, resolution)}
                >
                    <div class="rk-add">
                        <button class="addb" aria-haspopup="menu" aria-expanded={menu()} disabled={stale()} onClick={() => setMenu(!menu())}>
                            + Add a sound
                        </button>
                        <Show when={menu()}>
                            <div class="menu" role="menu">
                                <For each={choices()}>
                                    {(choice) => (
                                        <button
                                            role="menuitem"
                                            onClick={() => {
                                                addRow(props.id, choice.sound)
                                                setMenu(false)
                                            }}
                                        >
                                            {choice.label}
                                            <code>{choice.sound}</code>
                                        </button>
                                    )}
                                </For>
                            </div>
                        </Show>
                    </div>
                    <button
                        class="chip tgl"
                        classList={{ on: pianoFor() === props.id }}
                        aria-pressed={pianoFor() === props.id}
                        aria-label={`Play ${props.id} on the keyboard`}
                        title="Play the sounds of this grid on the computer's keyboard, or on a MIDI pad or keyboard"
                        onClick={() => {
                            setPianoFor(pianoFor() === props.id ? null : props.id)
                            void hearKeyboards()
                        }}
                    >
                        Keys
                    </button>
                    <Show when={pianoFor() === props.id}>
                        <button class="chip tgl" classList={{ on: pianoWrites() }} aria-pressed={pianoWrites()} aria-label="Write what is played" title="While the song plays, what you play is written into this grid" onClick={() => setPianoWrites(!pianoWrites())}>
                            Write
                        </button>
                    </Show>
                </GridFooter>
                <Show when={pianoFor() === props.id}>
                    <p class="rk-n" data-testid="pad-note">
                        A S D F G H J K L are the sounds of this grid, from the top one down.{' '}
                        <Show when={midiKeyboards()?.length}>A MIDI pad or keyboard plays them too: the kick on the low C, the snare on D, the closed hat on F sharp, as on a drum machine. </Show>
                        {pianoWrites() ? 'While the song plays, what you play is written in.' : 'Nothing is written in: you only hear what you play.'}
                    </p>
                </Show>
                <Show when={gridNotes()[props.id]}>
                    <p class="rk-n">This pattern changes from cycle to cycle or uses notation a grid cannot show, so it cannot be edited as a grid. Edit it in the code.</p>
                </Show>
            </Show>
        </div>
    )
}
