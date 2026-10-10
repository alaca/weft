import { createMemo, For, Show } from 'solid-js'
import { song, stale } from '../stores/song'
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
                    <Show
                        when={!stale()}
                        fallback={<p class="ctl-empty">The code has an error, so its controls cannot be drawn. Fix it in the code and they will appear.</p>}
                    >
                        <p class="ctl-empty">
                            Give a pattern a name to get controls for it, for example <code>drums: s("bd*4")</code>
                        </p>
                    </Show>
                }
            >
                <For each={ids()}>{(id) => <Strip id={id} />}</For>
            </Show>
            <OutputStrip />
        </main>
    )
}
