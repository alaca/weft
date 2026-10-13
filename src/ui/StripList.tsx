import { createMemo, createSignal, For, Show } from 'solid-js'
import { addPatternWith, restorePattern } from '../app/controller'
import { draggedSound, removed, song, songShown, stale, waveShown } from '../stores/song'
import { AddPattern } from './AddPattern'
import { OutputStrip } from './OutputStrip'
import { AskedAhead, SongPanel } from './SongPanel'
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
    // A sound let go where there is no pattern starts a new one with it.
    const [over, setOver] = createSignal(false)
    const free = (event: DragEvent) => draggedSound() !== null && !stale() && !(event.target as Element | null)?.closest('.st')
    return (
        <main
            class="ctl"
            data-testid="controls"
            data-drop={over() && draggedSound() ? '' : undefined}
            onDragOver={(event) => {
                setOver(free(event))
                if (!free(event)) return
                event.preventDefault()
                if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
            }}
            onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false)
            }}
            onDrop={(event) => {
                setOver(false)
                const item = draggedSound()
                if (!item || !free(event)) return
                event.preventDefault()
                addPatternWith(item)
            }}
        >
            <Show when={waveShown()}>
                <OutputStrip />
            </Show>
            <Show when={ids().length && songShown()} fallback={<AskedAhead />}>
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
