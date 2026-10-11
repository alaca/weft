import { toggleFold } from '../app/controller'
import type { LeftPanel } from '../library/layout'
import { folded } from '../stores/song'

export const isFolded = (panel: LeftPanel) => folded().includes(panel)

// Folds a panel of the left column to its heading, and unfolds it again.
export function Fold(props: { panel: LeftPanel; name: string }) {
    return (
        <button class="fold" aria-expanded={!isFolded(props.panel)} aria-label={`${isFolded(props.panel) ? 'Unfold' : 'Fold'} ${props.name}`} title={isFolded(props.panel) ? 'Unfold' : 'Fold to the heading'} onClick={() => toggleFold(props.panel)}>
            <svg viewBox="0 0 10 10" aria-hidden="true">
                <path d="M2 3.6 5 6.6 8 3.6" />
            </svg>
        </button>
    )
}
