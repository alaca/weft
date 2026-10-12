import { createMemo, createSignal, For, Show } from 'solid-js'
import { addRow, canWriteDrums, paintSteps, previewSound, removeGridRow, setLength, setMix, setStepsPerCycle, soundChoices, toggleAccent, togglePanel, toggleRowMute, toggleStep } from '../app/controller'
import { drumLabel } from '../controls/drums'
import { panOf, volumeOf } from '../controls/views'
import { DRUM_RESOLUTIONS, readGrid, resample, type Grid } from '../song/grid'
import { isDrums, readKit, rowTarget } from '../song/kit'
import type { PatternBlock } from '../song/types'
import { gridNotes, openPanel, stale } from '../stores/song'
import { GridFooter } from './GridFooter'
import { Knob } from './Knob'
import { StepGrid, type StepRow } from './StepGrid'

const NO_CONTROLS: PatternBlock = { id: '', label: '', muted: false, labelFrom: 0, labelTo: 0, from: 0, to: 0, lineFrom: 0, lineTo: 0, soundName: null, calls: [] }

function RowControls(props: { id: string; sound: string; block: PatternBlock | undefined; muted: boolean }) {
    const target = () => rowTarget(props.id, props.sound)
    const name = () => drumLabel(props.sound)
    return (
        <span class="rc">
            <button class="rm" classList={{ on: props.muted }} aria-label={`Mute ${props.sound}`} aria-pressed={props.muted} title={`Mute ${name()} only`} disabled={stale()} onClick={() => toggleRowMute(props.id, props.sound)}>
                M
            </button>
            <Knob small name={`Volume of ${props.sound}`} view={volumeOf(props.block ?? NO_CONTROLS)} disabled={stale()} onChange={(value) => setMix(target(), 'volume', value)} />
            <Knob small name={`Pan of ${props.sound}`} view={panOf(props.block ?? NO_CONTROLS)} disabled={stale()} onChange={(value) => setMix(target(), 'pan', value)} />
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
                  const heard = props.played.find((other) => other.name === row.sound)?.steps
                  const muted = mutedRows().includes(row.sound)
                  return { name: row.sound, steps, accents, muted, played: comparable && inSight() && !muted ? (heard ?? steps.map(() => false)) : undefined }
              })
            : props.played.map((row) => ({ name: row.name, steps: row.steps }))
        const extra = current && comparable ? props.played.filter((row) => !placed.some((other) => other.name === row.name)) : []
        return [...placed, ...extra.map((row) => ({ name: row.name, steps: row.steps.map(() => false), played: inSight() ? row.steps : undefined }))]
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
                    controls={
                        canEdit()
                            ? (sound) => <RowControls id={props.id} sound={sound()} block={kit()?.rows.find((row) => row.sound === sound())?.block} muted={mutedRows().includes(sound())} />
                            : undefined
                    }
                />
            </Show>
            <Show when={canEdit()}>
                <GridFooter
                    head={props.head}
                    cycles={cycles()}
                    perCycle={perCycle()}
                    resolutions={DRUM_RESOLUTIONS}
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
                </GridFooter>
                <Show when={gridNotes()[props.id]}>
                    <p class="rk-n">This pattern changes from cycle to cycle or uses notation a grid cannot show, so it cannot be edited as a grid. Edit it in the code.</p>
                </Show>
            </Show>
        </div>
    )
}
