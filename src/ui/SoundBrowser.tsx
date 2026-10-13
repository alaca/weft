import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from 'solid-js'
import { Fold, isFolded } from './Fold'
import { addOwnSounds, closeSounds, colorAt, hearSound, keepTake, openTrim, recordTake, removeOwnSound, soundCatalogue, useSound } from '../app/controller'
import { DEMO } from '../demo/demo'
import { lengthText } from '../library/sounds'
import { fits, inUse, takesKit } from '../sounds/apply'
import { countSounds, findSounds, SOUND_DRAG, SOUND_GROUPS, type SoundGroup, type SoundItem } from '../sounds/catalog'
import { engineState, ownSoundNote, ownSounds, selected, setDraggedSound, song, soundsOpen, stale, takeOpening, takeSince } from '../stores/song'

// The demo has no sounds of your own.
const GROUPS = DEMO ? SOUND_GROUPS.filter((entry) => entry.id !== 'yours') : SOUND_GROUPS

export function SoundBrowser() {
    let search: HTMLInputElement | undefined
    let list: HTMLDivElement | undefined
    let files: HTMLInputElement | undefined
    const [query, setQuery] = createSignal('')
    const [group, setGroup] = createSignal<SoundGroup>('instruments')
    const index = () => song().patterns.findIndex((p) => p.id === selected())
    const target = () => song().patterns[index()]
    const loaded = createMemo(() => engineState().sounds)
    const items = createMemo(() => (soundsOpen() && loaded() !== 'loading' && ownSounds() ? soundCatalogue() : []))
    const lengthOf = (name: string) => ownSounds().find((sound) => sound.name === name)?.seconds

    // How long the take has been going, counted while there is one.
    const [clock, setClock] = createSignal(Date.now())
    createEffect(() => {
        if (takeSince() === null) return
        const ticking = window.setInterval(() => setClock(Date.now()), 250)
        onCleanup(() => window.clearInterval(ticking))
    })
    const elapsed = () => {
        const seconds = Math.max(0, Math.floor((clock() - (takeSince() ?? clock())) / 1000))
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    }
    const shown = createMemo(() => findSounds(items(), group(), query()))
    const counts = createMemo(() => countSounds(items(), query()))
    const suited = (): SoundGroup => (target() && takesKit(target()) ? 'kits' : 'instruments')
    const usable = () => target() !== undefined && fits(target(), group())
    const used = (item: SoundItem) => target() !== undefined && inUse(target(), item)
    const labelOf = (id: SoundGroup) => SOUND_GROUPS.find((entry) => entry.id === id)?.label ?? ''

    createEffect(
        on(soundsOpen, (open) => {
            if (!open) return
            setGroup(suited())
            queueMicrotask(() => search?.focus())
        }),
    )
    createEffect(
        on(selected, () => {
            if (soundsOpen() && target() && !fits(target(), group())) setGroup(suited())
        }),
    )
    createEffect(
        on([soundsOpen, selected, group, () => items().length], () => {
            if (!soundsOpen() || query().trim()) return
            queueMicrotask(() => list?.querySelector('.sb-i.on')?.scrollIntoView({ block: 'center' }))
        }),
    )

    return (
        <Show when={soundsOpen()}>
            <aside class="sb" classList={{ folded: isFolded('sounds') }} aria-label="Sounds" data-testid="sound-browser">
                <div class="sb-h">
                    <Fold panel="sounds" name="the sounds" />
                    <h2>Sounds</h2>
                    <span class="grow" />
                    <button class="ib" aria-label="Close sounds" onClick={closeSounds}>
                        <svg viewBox="0 0 16 16">
                            <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                        </svg>
                    </button>
                </div>
                <p class="sb-t" data-testid="sound-target">
                    <Show when={target()} fallback="Click a pattern to choose its sound. You can listen to every sound without one.">
                        {(block) => (
                            <>
                                <i class="bead-h" style={{ '--h': colorAt(index()) }} />
                                <span>
                                    For <b>{block().id}</b>
                                </span>
                                <Show when={block().soundName}>
                                    <span>
                                        now <code>{block().soundName}</code>
                                    </span>
                                </Show>
                            </>
                        )}
                    </Show>
                </p>
                <div class="sb-q">
                    <input
                        class="br-s"
                        ref={search}
                        type="search"
                        placeholder="Search sounds"
                        aria-label="Search sounds"
                        value={query()}
                        onInput={(event) => setQuery(event.currentTarget.value)}
                    />
                    <div class="br-c" role="radiogroup" aria-label="Kind of sound">
                        <For each={GROUPS}>
                            {(entry) => (
                                <button class="chip" classList={{ on: group() === entry.id }} role="radio" aria-checked={group() === entry.id} onClick={() => setGroup(entry.id)}>
                                    {entry.label}
                                    <Show when={query().trim()}>
                                        <span class="sb-c">{counts()[entry.id]}</span>
                                    </Show>
                                </button>
                            )}
                        </For>
                    </div>
                </div>
                <Show when={loaded() === 'loading'}>
                    <p class="sb-n">The sounds are still loading.</p>
                </Show>
                <Show when={loaded() === 'failed'}>
                    <p class="sb-n">Drum and instrument samples could not be loaded. Synth sounds still work.</p>
                </Show>
                <Show when={target() && !usable() ? target() : undefined}>
                    {(block) => (
                        <p class="sb-n" data-testid="sound-hint">
                            <Show
                                when={takesKit(block())}
                                fallback={
                                    <>
                                        <b>{block().id}</b> plays notes, so it takes an instrument, a synth or a sample.{' '}
                                        <button onClick={() => setGroup('instruments')}>Show instruments</button>
                                    </>
                                }
                            >
                                <b>{block().id}</b> is a drum grid, so it takes a drum kit.{' '}
                                <button onClick={() => setGroup('kits')}>Show drum kits</button>
                            </Show>
                        </p>
                    )}
                </Show>
                <Show when={group() === 'yours'}>
                    <div class="sb-own">
                        <input
                            ref={files}
                            type="file"
                            accept="audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg,.aif,.aiff"
                            multiple
                            hidden
                            data-testid="own-files"
                            onChange={(event) => {
                                const picked = [...(event.currentTarget.files ?? [])]
                                event.currentTarget.value = ''
                                if (picked.length) void addOwnSounds(picked)
                            }}
                        />
                        <button class="btn" disabled={loaded() === 'loading'} onClick={() => files?.click()}>
                            + Add audio files
                        </button>
                        <Show
                            when={takeSince() !== null}
                            fallback={
                                // A button that is switched off loses the keyboard. While the microphone
                                // opens Record only says that it takes no press, so that after a
                                // microphone that failed the same key presses Record again.
                                <button class="btn" disabled={loaded() === 'loading'} aria-disabled={takeOpening() ? 'true' : 'false'} title={takeOpening() ? 'The microphone is opening' : 'Makes a sound of your own from the microphone'} onClick={() => void recordTake()}>
                                    <i class="rec" />
                                    {takeOpening() ? 'Opening' : 'Record'}
                                </button>
                            }
                        >
                            <button class="btn on" aria-label="Stop recording" onClick={() => void keepTake()}>
                                <i class="rec live" />
                                Stop, {elapsed()}
                            </button>
                        </Show>
                    </div>
                    <Show when={ownSoundNote()}>
                        <p class="sb-n" role="status" data-testid="own-note">
                            {ownSoundNote()}
                        </p>
                    </Show>
                </Show>
                <div class="sb-l" ref={list}>
                    <For each={shown()}>
                        {(item) => (
                            <div
                                class="sb-i"
                                classList={{ on: used(item), own: item.group === 'yours' }}
                                draggable="true"
                                title="Drag onto a pattern, into the code, or under the patterns to start a new one"
                                onDragStart={(event) => {
                                    event.dataTransfer?.setData(SOUND_DRAG, item.name)
                                    event.dataTransfer?.setData('text/plain', item.name)
                                    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
                                    setDraggedSound(item)
                                }}
                                onDragEnd={() => setDraggedSound(null)}
                            >
                                <button class="sb-p" aria-label={`Hear ${item.label}`} onClick={() => hearSound(item)}>
                                    <svg viewBox="0 0 10 10" aria-hidden="true">
                                        <path d="M2.5 1.2v7.6L8.8 5z" />
                                    </svg>
                                    <b>{item.label}</b>
                                    <code>{item.name}</code>
                                    <Show when={item.group === 'yours' && lengthOf(item.name) !== undefined}>
                                        <span class="sb-c">{lengthText(lengthOf(item.name) ?? 0)}</span>
                                    </Show>
                                </button>
                                <Show when={usable()}>
                                    <Show when={!used(item)} fallback={<span class="sb-on">In use</span>}>
                                        <button class="sb-u" disabled={stale()} aria-label={`Use ${item.label} for ${target().id}`} onClick={() => useSound(target().id, item)}>
                                            Use
                                        </button>
                                    </Show>
                                </Show>
                                <Show when={item.group === 'yours'}>
                                    <button class="rx tr-b" aria-label={`Cut ${item.label} shorter`} title="Cut its start and its end off" onClick={() => void openTrim(item.name)}>
                                        <svg viewBox="0 0 10 10">
                                            <path d="M2 1.5v7M8 1.5v7M2 5h6" />
                                        </svg>
                                    </button>
                                    <button class="rx" aria-label={`Remove ${item.label} from your sounds`} onClick={() => void removeOwnSound(item.name)}>
                                        <svg viewBox="0 0 8 8">
                                            <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
                                        </svg>
                                    </button>
                                </Show>
                                <Show when={item.parts.length}>
                                    <div class="sb-m">
                                        <For each={item.parts}>
                                            {(part) => (
                                                <button aria-label={`Hear ${item.label} ${part.label}`} onClick={() => hearSound(item, part.sound)}>
                                                    {part.label}
                                                </button>
                                            )}
                                        </For>
                                    </div>
                                </Show>
                            </div>
                        )}
                    </For>
                    <Show when={loaded() !== 'loading' && !shown().length}>
                        <p class="br-e">
                            <Show when={group() === 'yours' && !query().trim()} fallback={<>Nothing in {labelOf(group())} matches.</>}>
                                Nothing here yet. A file you add can be the sound of a pattern that plays notes, or a row in a drum grid.
                            </Show>
                        </p>
                    </Show>
                </div>
            </aside>
        </Show>
    )
}
