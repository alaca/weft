import { Show } from 'solid-js'
import { song } from '../stores/song'

export function StripList() {
    return (
        <main class="ctl" data-testid="controls">
            <Show when={song().patterns.length === 0}>
                <p class="ctl-empty">
                    Give a pattern a name to get controls for it, for example <code>drums: s("bd*4")</code>
                </p>
            </Show>
        </main>
    )
}
