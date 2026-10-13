import { createMemo, For, onCleanup, onMount, Show } from 'solid-js'
import { colorAt, levelOfPattern, select, setMix, showMeters, toggleMute, toggleSolo, turnControl } from '../app/controller'
import { findDef } from '../controls/catalog'
import { controlOf, panOf, volumeOf } from '../controls/views'
import { meterShare, settle, shareOf } from '../library/mix'
import { soloIds, song, stale } from '../stores/song'
import { Fader } from './Fader'
import { Knob } from './Knob'

const HOLD = 1200
// What a strip has under its fader, besides where the pattern sits: what it cuts off at the
// bottom and at the top, and how much of it goes to the room and to the echo that the patterns
// share. Each is the same knob as in the pattern's own panel, by another road.
const KNOBS = ['hpf', 'lpf', 'room', 'delay']

// The patterns side by side as the strips of a mixing desk. Everything on a strip is written in
// the code as the same knob is anywhere else, so it is part of the song; only the meter is not.
export function MixStrips() {
    const ids = createMemo(() => [...new Set(song().patterns.map((block) => block.id))], [] as string[], { equals: (a, b) => a.length === b.length && a.every((id, at) => id === b[at]) })
    const bars = new Map<string, HTMLElement>()
    const marks = new Map<string, HTMLElement>()
    const shown = new Map<string, number>()
    const most = new Map<string, { level: number; since: number }>()
    let frame = 0
    let before = 0

    // The meters are moved as the sound is, many times a second, so they are written straight
    // onto the page, all of them in one turn.
    const draw = (time: number) => {
        const seconds = before ? (time - before) / 1000 : 0
        before = time
        for (const [id, bar] of bars) {
            // A pattern that is gone takes its strip with it.
            if (!bar.isConnected) {
                bars.delete(id)
                marks.delete(id)
                continue
            }
            const level = settle(shown.get(id) ?? 0, document.hidden ? 0 : meterShare(levelOfPattern(id)), seconds)
            shown.set(id, level)
            const held = most.get(id) ?? { level: 0, since: time }
            if (level >= held.level) most.set(id, { level, since: time })
            else if (time - held.since > HOLD) most.set(id, { level: settle(held.level, level, seconds), since: held.since })
            const top = most.get(id)?.level ?? 0
            bar.style.height = `${(1 - level) * 100}%`
            bar.parentElement!.dataset.over = top > shareOf(0) ? 'yes' : 'no'
            bar.parentElement!.dataset.sounds = level > 0.004 ? 'yes' : 'no'
            const mark = marks.get(id)
            if (mark) {
                mark.style.bottom = `${top * 100}%`
                mark.style.opacity = top > 0.004 ? '1' : '0'
            }
        }
        frame = requestAnimationFrame(draw)
    }
    onMount(() => {
        showMeters(true)
        frame = requestAnimationFrame(draw)
    })
    onCleanup(() => {
        cancelAnimationFrame(frame)
        showMeters(false)
    })

    return (
        <div class="ms-w" role="group" aria-label="Mixer" data-testid="mix-strips">
            <Show when={ids().length} fallback={<p class="st-empty">No patterns to mix yet.</p>}>
                <For each={ids()}>
                    {(id, index) => {
                        const block = () => song().patterns.find((pattern) => pattern.id === id)
                        return (
                            <Show when={block()}>
                                {(now) => (
                                    <section class="ms-s" classList={{ muted: now().muted }} style={{ '--h': colorAt(index()) }} aria-label={`Strip of ${id}`} data-testid={`mix-${id}`}>
                                        <button class="ms-n" title={`Go to ${id}`} onClick={() => select(id)}>
                                            <i />
                                            <span>{id}</span>
                                        </button>
                                        <div class="ms-f">
                                            <div class="vu-b" role="img" aria-label={`How loud ${id} is`}>
                                                <i class="vu-d" ref={(el) => bars.set(id, el)} />
                                                <i class="vu-p" ref={(el) => marks.set(id, el)} />
                                            </div>
                                            <Fader
                                                name={`Volume of ${id}`}
                                                value={volumeOf(now()).value}
                                                min={volumeOf(now()).min}
                                                max={volumeOf(now()).max}
                                                usual={1}
                                                text={volumeOf(now()).text}
                                                about={`How loud ${id} is, after its effects. Double click for 1.`}
                                                onChange={(value) => !stale() && setMix(id, 'volume', value)}
                                            />
                                        </div>
                                        <b class="ms-v">{volumeOf(now()).state === 'faint' ? '1' : volumeOf(now()).text}</b>
                                        <Knob small name={`Pan of ${id}`} view={panOf(now())} disabled={stale()} onChange={(value) => setMix(id, 'pan', value)} />
                                        <span class="cap">Pan</span>
                                        <div class="ms-k">
                                            <For each={KNOBS}>
                                                {(fn) => (
                                                    <span>
                                                        <Knob
                                                            small
                                                            name={`${findDef(fn)?.label} of ${id}`}
                                                            view={controlOf(now(), fn)}
                                                            disabled={stale()}
                                                            onChange={(value) => turnControl(id, fn, value)}
                                                        />
                                                        <span class="cap">{findDef(fn)?.label}</span>
                                                    </span>
                                                )}
                                            </For>
                                        </div>
                                        <span class="ms">
                                            <button classList={{ on: now().muted }} aria-label={`Mute ${id}`} aria-pressed={now().muted} disabled={stale()} onClick={() => toggleMute(id)}>
                                                M
                                            </button>
                                            <button classList={{ on: soloIds().includes(id) }} aria-label={`Solo ${id}`} aria-pressed={soloIds().includes(id)} onClick={() => toggleSolo(id)}>
                                                S
                                            </button>
                                        </span>
                                    </section>
                                )}
                            </Show>
                        )
                    }}
                </For>
            </Show>
        </div>
    )
}
