import { createMemo, createSignal, For, Show } from 'solid-js'
import { addControl } from '../app/controller'
import type { FilterType, PanelGroup } from '../controls/catalog'
import { browserItems } from '../controls/views'
import type { PatternBlock } from '../song/types'
import { stale } from '../stores/song'

const CHIPS: { id: PanelGroup | 'all'; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'source', label: 'Source' },
    { id: 'filter', label: 'Filter' },
    { id: 'shape', label: 'Shape' },
    { id: 'effects', label: 'Effects' },
]

export function ControlBrowser(props: { id: string; block: PatternBlock; filter: FilterType }) {
    const [query, setQuery] = createSignal('')
    const [group, setGroup] = createSignal<PanelGroup | 'all'>('all')
    const items = createMemo(() => {
        const words = query().trim().toLowerCase()
        return browserItems(props.block, props.filter).filter(
            (def) =>
                (group() === 'all' || def.group === group()) &&
                (!words || `${def.label} ${def.describe} ${def.fn}`.toLowerCase().includes(words)),
        )
    })

    return (
        <section class="br" role="region" aria-label="All controls">
            <div class="br-h">
                <input
                    class="br-s"
                    type="search"
                    placeholder="Search controls"
                    aria-label="Search controls"
                    value={query()}
                    onInput={(event) => setQuery(event.currentTarget.value)}
                />
                <div class="br-c">
                    <For each={CHIPS}>
                        {(chip) => (
                            <span class="chip" classList={{ on: group() === chip.id }} role="radio" aria-checked={group() === chip.id} tabindex="0" onClick={() => setGroup(chip.id)}>
                                {chip.label}
                            </span>
                        )}
                    </For>
                </div>
            </div>
            <div class="br-l">
                <For each={items()}>
                    {(def) => (
                        <button class="br-i" disabled={stale()} onClick={() => addControl(props.id, def.fn)}>
                            <span>
                                <b>{def.label}</b>
                                <span>{def.describe}</span>
                            </span>
                            <code>.{def.fn}</code>
                        </button>
                    )}
                </For>
            </div>
            <Show when={!items().length}>
                <p class="br-e">Nothing matches. Everything else is already on the panel.</p>
            </Show>
        </section>
    )
}
