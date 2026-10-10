import { createMemo, For, Show } from 'solid-js'
import { restorePattern } from '../app/controller'
import { removed, song, stale } from '../stores/song'
import { AddPattern } from './AddPattern'
import { OutputStrip } from './OutputStrip'
import { SongPanel } from './SongPanel'
import { Strip } from './Strip'

const GONE = '\u0000gone'

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i])

export function StripList() {
    const ids = createMemo(() => [...new Set(song().patterns.map((p) => p.id))], [] as string[], { equals: sameList })
    const rows = createMemo(
        () => {
            const gone = removed()
            if (!gone) return ids()
            const at = Math.min(gone.index, ids().length)
            return [...ids().slice(0, at), GONE, ...ids().slice(at)]
        },
        [] as string[],
        { equals: sameList },
    )
    return (
        <main class="ctl" data-testid="controls">
            <OutputStrip />
            <Show when={ids().length}>
                <SongPanel />
            </Show>
            <Show when={!ids().length}>
                <Show when={!stale()} fallback={<p class="ctl-empty">The code has an error, so its controls cannot be drawn. Fix it in the code and they will appear.</p>}>
                    <p class="ctl-empty">
                        Give a pattern a name to get controls for it, for example <code>drums: s("bd*4")</code>. You can also add one below.
                    </p>
                </Show>
            </Show>
            <For each={rows()}>
                {(id) => (
                    <Show when={id !== GONE} fallback={<Gone />}>
                        <Strip id={id} />
                    </Show>
                )}
            </For>
            <AddPattern />
        </main>
    )
}

function Gone() {
    return (
        <div class="gone" role="status" data-testid="removed">
            <span>
                <b>{removed()?.id}</b> was removed.
            </span>
            <span class="grow" />
            <button class="chip" disabled={stale()} onClick={restorePattern}>
                Put it back
            </button>
        </div>
    )
}
