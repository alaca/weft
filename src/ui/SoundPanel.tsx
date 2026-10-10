import { createMemo, For, Show } from 'solid-js'
import { addControl, removeControl, setControl } from '../app/controller'
import type { PanelGroup } from '../controls/catalog'
import { panelFor } from '../controls/views'
import type { PatternBlock } from '../song/types'
import { stale } from '../stores/song'
import { Knob } from './Knob'

const GROUPS: { id: PanelGroup; title: string }[] = [
    { id: 'source', title: 'Source' },
    { id: 'filter', title: 'Filter' },
    { id: 'shape', title: 'Shape' },
    { id: 'effects', title: 'Effects' },
]

export function SoundPanel(props: { id: string; block: PatternBlock }) {
    const panel = createMemo(() => panelFor(props.block))
    const items = (group: PanelGroup) => panel().find((entry) => entry.group === group)?.items ?? []

    return (
        <div onClick={(event) => event.stopPropagation()}>
            <div class="sp">
                <For each={GROUPS}>
                    {(group) => (
                        <div>
                            <h4>{group.title}</h4>
                            <div class="krow">
                                <For each={items(group.id).map((item) => item.fn)}>
                                    {(fn) => (
                                        <Show when={items(group.id).find((item) => item.fn === fn)}>
                                            {(view) => (
                                                <Knob
                                                    view={view()}
                                                    disabled={stale()}
                                                    onChange={(value) => setControl(props.id, fn, value)}
                                                    onAdd={() => addControl(props.id, fn)}
                                                    onRemove={() => removeControl(props.id, fn)}
                                                />
                                            )}
                                        </Show>
                                    )}
                                </For>
                            </div>
                        </div>
                    )}
                </For>
            </div>
            <p class="sp-f">Faint knobs are not in the code yet. Press one and its line is added.</p>
        </div>
    )
}
