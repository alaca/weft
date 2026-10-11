import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { deleteSong, listSongs, openSong, renameSong, restoreSong, revertSong } from '../app/controller'
import { whenText } from '../library/shelf'
import { jamming, jamPeer } from '../stores/jam'
import { currentSong, deletedSong, songs } from '../stores/song'

// The song that is open, by name, and the songs you have. Everything that is done with a song
// is in the top bar beside it.
export function SongMenu() {
    let root!: HTMLDivElement
    const [open, setOpen] = createSignal(false)
    const [now, setNow] = createSignal(Date.now())
    const list = createMemo(() => songs().map((entry) => (entry.id === currentSong()?.id ? (currentSong() ?? entry) : entry)))

    const toggle = () => {
        if (!open()) {
            listSongs()
            setNow(Date.now())
        }
        setOpen(!open())
    }
    const away = (event: PointerEvent) => {
        if (open() && !root.contains(event.target as Node)) setOpen(false)
    }
    // The menu listens on the page and not on itself: in WebKit a click does not give a button
    // the focus, so a key pressed right after opening the menu never reaches it.
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
            <button class="proj-b" data-testid="song-name" aria-haspopup="dialog" aria-expanded={open()} aria-label={`Songs. This one is ${currentSong()?.name ?? ''}`} onClick={toggle}>
                <b>{currentSong()?.name}</b>
                <Show when={currentSong()?.changed}>
                    <i class="proj-d" title="Changed since it was saved" />
                </Show>
                <svg viewBox="0 0 10 10" aria-hidden="true">
                    <path d="M2 3.6 5 6.6 8 3.6" />
                </svg>
            </button>
            <Show when={open() ? currentSong() : null}>
                {(song) => (
                    <div class="sm" role="dialog" aria-label="Songs" data-testid="song-menu">
                        <input
                            class="sm-name"
                            aria-label="Name of this song"
                            value={song().name}
                            maxLength={60}
                            onChange={(event) => {
                                if (!renameSong(song().id, event.currentTarget.value)) event.currentTarget.value = song().name
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') event.currentTarget.blur()
                            }}
                        />
                        <p class="sm-note" data-testid="song-state">
                            {song().changed ? 'Changed since it was saved.' : 'Saved.'} Your work is kept as you go, also when you do not save. Saving marks the version you can go back to.
                        </p>
                        <Show when={song().changed}>
                            <div class="sm-row">
                                <button class="chip tgl" onClick={revertSong}>
                                    Go back to the saved version
                                </button>
                            </div>
                        </Show>
                        <Show when={jamming()}>
                            <p class="sm-note" role="status" data-testid="song-jam">
                                You are in a jam with {jamPeer()} on this song. To open another song, press Leave in the Jams panel first.
                            </p>
                        </Show>
                        <h4>Your songs</h4>
                        <div class="sm-list" data-testid="your-songs">
                            <For each={list()}>
                                {(entry) => (
                                    <div class="sm-i" classList={{ on: entry.id === song().id }}>
                                        <button
                                            class="sm-o"
                                            aria-label={`Open ${entry.name}`}
                                            aria-current={entry.id === song().id}
                                            disabled={jamming() && entry.id !== song().id}
                                            onClick={() => {
                                                openSong(entry.id)
                                                setOpen(false)
                                            }}
                                        >
                                            <b>{entry.name}</b>
                                            <span>
                                                {entry.id === song().id ? 'open now' : whenText(entry.changedAt, now())}
                                                {entry.changed ? ', not saved' : ''}
                                            </span>
                                        </button>
                                        <button class="rx" aria-label={`Delete ${entry.name}`} disabled={jamming() && entry.id === song().id} onClick={() => deleteSong(entry.id)}>
                                            <svg viewBox="0 0 8 8">
                                                <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
                                            </svg>
                                        </button>
                                    </div>
                                )}
                            </For>
                        </div>
                        <Show when={deletedSong()}>
                            {(gone) => (
                                <p class="sm-gone" role="status">
                                    <span>
                                        <b>{gone().name}</b> was deleted.
                                    </span>
                                    <button class="chip tgl" onClick={restoreSong}>
                                        Put it back
                                    </button>
                                </p>
                            )}
                        </Show>
                    </div>
                )}
            </Show>
        </div>
    )
}
