import { createMemo, For, Show } from 'solid-js'
import { song } from '../stores/song'
import { OutputStrip } from './OutputStrip'
import { Strip } from './Strip'

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i])

export function StripList() {
    const ids = createMemo(() => [...new Set(song().patterns.map((p) => p.id))], [] as string[], { equals: sameList })
    return (
        <main class="ctl" data-testid="controls">
            <Show
                when={ids().length}
                fallback={
                    <p class="ctl-empty">
                        Give a pattern a name to get controls for it, for example <code>drums: s("bd*4")</code>
                    </p>
                }
            >
                <For each={ids()}>{(id) => <Strip id={id} />}</For>
            </Show>
            <OutputStrip />
        </main>
    )
}
