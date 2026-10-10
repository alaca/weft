import { For } from 'solid-js'
import { addPattern } from '../app/controller'
import { PATTERN_STARTERS, type StarterKind } from '../song/patterns'
import { draggedSound, stale } from '../stores/song'

export function AddPattern() {
    let row!: HTMLDivElement
    const add = (kind: StarterKind) => {
        if (addPattern(kind)) queueMicrotask(() => row.scrollIntoView({ block: 'nearest' }))
    }
    return (
        <div class="add" ref={row} role="group" aria-label="Add a pattern" data-testid="add-pattern">
            <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M6 1.5v9M1.5 6h9" />
            </svg>
            <span>{draggedSound() ? `Let go here, or anywhere between the patterns, to start a new one with ${draggedSound()?.label}` : 'Add a pattern'}</span>
            <span class="grow" />
            <For each={PATTERN_STARTERS}>
                {(starter) => (
                    <button class="chip" disabled={stale()} onClick={() => add(starter.kind)}>
                        {starter.label}
                    </button>
                )}
            </For>
        </div>
    )
}
