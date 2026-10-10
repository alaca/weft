import { createMemo, createSignal, For, Show } from 'solid-js'
import { addRow, previewSound, removeGridRow, setLength, setStepsPerCycle, soundChoices, toggleStep } from '../app/controller'
import { readGrid, resample, sourceText } from '../song/grid'
import type { PatternBlock } from '../song/types'
import { gridNotes, pinnedRows, stale } from '../stores/song'
import { GridFooter } from './GridFooter'
import { StepGrid, type StepRow } from './StepGrid'

const RESOLUTIONS = [16, 32]

export function Rack(props: { id: string; block: PatternBlock; played: { name: string; steps: boolean[] }[]; playing: boolean; position: number; cycle: number }) {
    const [page, setPage] = createSignal(0)
    const [menu, setMenu] = createSignal(false)
    const source = createMemo(() => readGrid(props.block))
    const canEdit = () => sourceText(props.block) !== null
    const cycles = () => source()?.grid.cycles ?? 1
    const perCycle = () => source()?.grid.perCycle ?? props.played[0]?.steps.length ?? 16
    const shown = () => (props.playing ? props.cycle % cycles() : Math.min(page(), cycles() - 1))

    const rows = createMemo((): StepRow[] => {
        const grid = source()?.grid
        const from = shown() * perCycle()
        const comparable = props.playing && perCycle() === 16
        const placed: StepRow[] = grid
            ? grid.rows.map((row) => {
                  const steps = row.steps.slice(from, from + perCycle())
                  const heard = props.played.find((other) => other.name === row.sound)?.steps
                  return { name: row.sound, steps, played: comparable ? (heard ?? steps.map(() => false)) : undefined }
              })
            : props.played.map((row) => ({ name: row.name, steps: row.steps }))
        const extra = grid && comparable ? props.played.filter((row) => !placed.some((other) => other.name === row.name)) : []
        const names = [...placed, ...extra].map((row) => row.name)
        const empty = (pinnedRows()[props.id] ?? []).filter((name) => !names.includes(name))
        return [
            ...placed,
            ...extra.map((row) => ({ name: row.name, steps: row.steps.map(() => false), played: row.steps })),
            ...empty.map((name) => ({ name, steps: Array<boolean>(perCycle()).fill(false) })),
        ]
    })

    const choices = () => soundChoices(props.id, rows().map((row) => row.name))
    return (
        <div class="rk" onClick={(event) => event.stopPropagation()}>
            <Show when={rows().length} fallback={<p class="st-empty">No sounds yet. Add one below.</p>}>
                <StepGrid
                    rows={rows()}
                    playing={props.playing}
                    position={props.position}
                    disabled={stale()}
                    onToggle={canEdit() ? (sound, step) => toggleStep(props.id, sound, shown() * perCycle() + step) : undefined}
                    onHear={(sound) => previewSound(props.id, sound)}
                    onRemove={canEdit() ? (sound) => removeGridRow(props.id, sound) : undefined}
                />
            </Show>
            <Show when={canEdit()}>
                <GridFooter
                    cycles={cycles()}
                    perCycle={perCycle()}
                    resolutions={RESOLUTIONS}
                    canUse={(resolution) => {
                        const grid = source()?.grid
                        return !grid || resample(grid, resolution) !== null
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
