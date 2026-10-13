import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { openSong, revertSong } from '../app/controller'
import { SITE } from '../site/api'
import { currentSong, songs } from '../stores/song'

// The demo's songs. What is changed in one stays while the page is open, and can be taken back.
export function DemoMenu() {
    let root!: HTMLDivElement
    const [open, setOpen] = createSignal(false)
    const list = createMemo(() => [...songs()].sort((a, b) => a.name.localeCompare(b.name)))
    const away = (event: PointerEvent) => {
        if (open() && !root.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
        if (open() && event.key === 'Escape') setOpen(false)
    }
    onMount(() => {
        document.addEventListener('pointerdown', away)
        document.addEventListener('keydown', escape)
    })
    onCleanup(() => {
        document.removeEventListener('pointerdown', away)
        document.removeEventListener('keydown', escape)
    })

    return (
        <div class="proj" ref={root}>
            <button class="proj-b" data-testid="song-name" aria-haspopup="dialog" aria-expanded={open()} aria-label={`Songs. This one is ${currentSong()?.name ?? ''}`} onClick={() => setOpen(!open())}>
                <b>{currentSong()?.name}</b>
                <svg viewBox="0 0 10 10" aria-hidden="true">
                    <path d="M2 3.6 5 6.6 8 3.6" />
                </svg>
            </button>
            <Show when={open() ? currentSong() : null}>
                {(song) => (
                    <div class="sm" role="dialog" aria-label="Songs" data-testid="song-menu">
                        <p class="sm-note">
                            This is the demo. Change anything: nothing is kept, and loading the page again starts every song over. <a href={`${SITE}/download`}>Get the app</a> to save, export and publish songs, record sounds of your own and jam.
                        </p>
                        <Show when={song().changed}>
                            <div class="sm-row">
                                <button class="chip tgl" onClick={revertSong}>
                                    Start this song over
                                </button>
                            </div>
                        </Show>
                        <h4>Songs to try</h4>
                        <div class="sm-list" data-testid="demo-songs">
                            <For each={list()}>
                                {(entry) => (
                                    <div class="sm-i" classList={{ on: entry.id === song().id }}>
                                        <button
                                            class="sm-o"
                                            aria-label={`Open ${entry.name}`}
                                            aria-current={entry.id === song().id}
                                            onClick={() => {
                                                openSong(entry.id)
                                                setOpen(false)
                                            }}
                                        >
                                            <b>{entry.name}</b>
                                            <span>{entry.id === song().id ? 'open now' : entry.changed ? 'changed' : ''}</span>
                                        </button>
                                    </div>
                                )}
                            </For>
                        </div>
                    </div>
                )}
            </Show>
        </div>
    )
}
