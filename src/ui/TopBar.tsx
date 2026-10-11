import { For, onCleanup, onMount, Show } from 'solid-js'
import { openAccount } from '../app/account'
import {
    closeSong,
    dismissSongNote,
    duplicateSong,
    newSong,
    openExport,
    openJams,
    openSongFile,
    saveSong,
    setPlayMode,
    setTempo,
    setView,
    SONG_KINDS,
    stop,
    toggleJams,
    toggleMixer,
    togglePlay,
    toggleSongPanel,
    toggleSounds,
    toggleWaveform,
} from '../app/controller'
import { openPublish } from '../app/publish'
import { me } from '../stores/account'
import { beat, bpm, currentSong, cycle, engineState, mixerOpen, playMode, song, songNote, songShown, soundsOpen, stale, startOpen, viewMode, waveShown, type PlayMode, type ViewMode } from '../stores/song'
import { jamListed, jamming, jamPeer, jamsOpen, jamUnread } from '../stores/jam'
import { MOD } from './keys'
import { Mark } from './Mark'
import { SongMenu } from './SongMenu'

const MODES: { id: PlayMode; label: string; about: string }[] = [
    { id: 'song', label: 'Song', about: 'Plays the bars as they are filled in the Song panel' },
    { id: 'live', label: 'Live', about: 'Plays every pattern round and round, whatever the bars say' },
]

const VIEWS: { id: ViewMode; label: string }[] = [
    { id: 'controls', label: 'Controls' },
    { id: 'both', label: 'Both' },
    { id: 'code', label: 'Code' },
]

export function TopBar() {
    let picker: HTMLInputElement | undefined
    let said: HTMLParagraphElement | undefined
    // What was said about a song is put away by the next press anywhere else.
    const away = (event: PointerEvent) => {
        if (songNote() && !startOpen() && !said?.contains(event.target as Node)) dismissSongNote()
    }
    onMount(() => document.addEventListener('pointerdown', away))
    onCleanup(() => document.removeEventListener('pointerdown', away))
    const inJam = 'You are in a jam on this song. Press Leave in the Jams panel first.'

    return (
        <header class="top" data-testid="top">
            <div class="brand">
                <Mark />
                <div class="word">Weft</div>
            </div>
            <div class="top-l">
                <SongMenu />
                <div class="acts" role="group" aria-label="This song">
                    <button class="ib" aria-label="Save" title={currentSong()?.changed ? `Save (${MOD} S). Marks the version you can go back to.` : 'Saved. Nothing has changed since.'} disabled={!currentSong()?.changed} onClick={saveSong}>
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                            <path class="ln" stroke-linejoin="round" d="M2.8 2.8h8.1l2.3 2.3v8.1H2.8zM5.2 2.8v3.4h5V2.8M5.2 13.2V9.4h5.6v3.8" />
                        </svg>
                    </button>
                    <button class="ib" aria-label="Close song" title={jamming() ? inJam : 'Close this song and go back to the start screen'} disabled={jamming()} onClick={closeSong}>
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                            <path class="ln" d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" />
                        </svg>
                    </button>
                </div>
                <i class="top-sep" />
                <div class="acts" role="group" aria-label="Songs and files">
                    <button class="ib" aria-label="New song" title={jamming() ? inJam : 'New song'} disabled={jamming()} onClick={newSong}>
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                            <path class="ln" stroke-linejoin="round" d="M3.8 2.3h5.4l3 3v8.4H3.8zM8 7.4v4M6 9.4h4" />
                        </svg>
                    </button>
                    <button class="ib" aria-label="Open a file" title={jamming() ? inJam : 'Open a song file, or a file of code'} disabled={jamming()} onClick={() => picker?.click()}>
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                            <path class="ln" stroke-linejoin="round" d="M2 4h4l1.5 1.6H14v7.2H2z" />
                        </svg>
                    </button>
                    <input
                        ref={picker}
                        type="file"
                        accept={SONG_KINDS.map((kind) => `.${kind}`).join(',')}
                        hidden
                        data-testid="song-file"
                        onChange={(event) => {
                            const file = event.currentTarget.files?.[0]
                            event.currentTarget.value = ''
                            if (file) void openSongFile(file)
                        }}
                    />
                    <button class="ib rare" aria-label="Duplicate this song" title={jamming() ? inJam : 'Duplicate this song'} disabled={jamming()} onClick={duplicateSong}>
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                            <path class="ln" stroke-linejoin="round" d="M5.6 5.6h7.6v7.6H5.6zM10.4 5.6V2.8H2.8v7.6h2.8" />
                        </svg>
                    </button>
                    <button class="ib rare" aria-label="Export" title="Export: a song file, the sound, or the code" onClick={openExport}>
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                            <path class="ln" stroke-linejoin="round" d="M8 2.4v7.8M4.9 7.2 8 10.3l3.1-3.1M2.8 13.2h10.4" />
                        </svg>
                    </button>
                    <button class="ib rare" aria-label="Publish" title="Publish: put this song on the Weft site, for others to hear and download" onClick={openPublish}>
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                            <path class="ln" stroke-linejoin="round" d="M8 10.4V2.6M4.9 5.6 8 2.5l3.1 3.1M2.8 13.2h10.4" />
                        </svg>
                    </button>
                </div>
            </div>
            <Show when={jamming()}>
                <button class="jm-with" title="Show the jam" data-testid="jam-with" onClick={openJams}>
                    <u />
                    With {jamPeer()}
                    <Show when={jamUnread() > 0}>
                        <b aria-label={`${jamUnread()} not read`}>{jamUnread()}</b>
                    </Show>
                </button>
            </Show>
            <div class="grow" />
            <div class="tp">
                <button class="play" aria-label={engineState().playing ? 'Pause' : 'Play'} onClick={togglePlay}>
                    <svg viewBox="0 0 16 16">
                        <path d={engineState().playing ? 'M4 2.8h3v10.4H4zM9 2.8h3v10.4H9z' : 'M4.8 2.6v10.8L13.4 8z'} />
                    </svg>
                </button>
                <button class="ib" aria-label="Stop" onClick={stop}>
                    <svg viewBox="0 0 16 16">
                        <rect x="3.6" y="3.6" width="8.8" height="8.8" rx="1.4" />
                    </svg>
                </button>
            </div>
            <div class="seg" role="group" aria-label="What plays">
                <For each={MODES}>
                    {(mode) => (
                        <button classList={{ on: playMode() === mode.id }} aria-pressed={playMode() === mode.id} title={mode.about} onClick={() => setPlayMode(mode.id)}>
                            {mode.label}
                        </button>
                    )}
                </For>
            </div>
            <div class="ros">
                <div class="ro">
                    <input
                        class="tempo"
                        data-testid="tempo"
                        type="number"
                        min="20"
                        max="300"
                        step="1"
                        aria-label="Tempo in beats per minute"
                        title={song().tempoLocked ? 'The tempo is worked out by code. Change it there.' : 'Tempo in beats per minute'}
                        value={Math.round(song().tempo?.bpm ?? bpm())}
                        disabled={stale() || song().tempoLocked}
                        onChange={(event) => setTempo(Number(event.currentTarget.value))}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur()
                        }}
                    />
                    <span class="cap">Tempo, bpm</span>
                </div>
                <div class="ro">
                    <b>
                        <span data-testid="cycle">{cycle() + 1}</span>
                        <span class="beats">
                            <For each={[0, 1, 2, 3]}>{(i) => <i classList={{ on: engineState().playing && beat() === i }} />}</For>
                        </span>
                    </b>
                    <span class="cap">Cycle</span>
                </div>
            </div>
            <div class="grow" />
            <div class="shows">
                <button
                    class="ib"
                    classList={{ on: jamsOpen(), open: jamListed() }}
                    aria-pressed={jamsOpen()}
                    aria-label="Jams"
                    title={jamListed() ? 'You are open to jam: people in the list can see you and ask to join' : jamsOpen() ? 'Hide the jam' : 'Play with someone else on one song'}
                    onClick={toggleJams}
                >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                        <circle cx="5.6" cy="6" r="2.5" />
                        <circle cx="11" cy="6.6" r="2" />
                        <path d="M1.4 13c.5-2.6 2.2-3.7 4.2-3.7s3.7 1.1 4.2 3.7zM10.6 13c-.1-1.2-.5-2.2-1.2-3 2.3-.9 4.7.2 5.2 3z" />
                    </svg>
                </button>
                <button class="ib" classList={{ on: soundsOpen() }} aria-pressed={soundsOpen()} aria-label="Sounds" title={soundsOpen() ? 'Hide the sounds' : 'Show the sounds'} onClick={toggleSounds}>
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path class="ln" d="M2.5 8h1.4M6 4.5v7M8.6 2.5v11M11.2 5.5v5M13.6 8h.4" />
                    </svg>
                </button>
                <button class="ib" classList={{ on: mixerOpen() }} aria-pressed={mixerOpen()} aria-label="Mixer" title={mixerOpen() ? 'Hide the mixer' : 'Show the mixer: volume, pan, tone and the meters'} onClick={toggleMixer}>
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path class="ln" d="M4 2.5v11M8 2.5v11M12 2.5v11" />
                        <path d="M2.4 8.6h3.2v2.4H2.4zM6.4 4.2h3.2v2.4H6.4zM10.4 9.8h3.2v2.4h-3.2z" />
                    </svg>
                </button>
                <button class="ib" classList={{ on: waveShown() }} aria-pressed={waveShown()} aria-label="Waveform" title={waveShown() ? 'Hide the waveform' : 'Show the waveform'} onClick={toggleWaveform}>
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path class="ln" d="M1.5 8c1.1-5 2.2-5 3.3 0s2.2 5 3.3 0 2.2-5 3.3 0 2.2 5 3.1 0" />
                    </svg>
                </button>
                <button class="ib" classList={{ on: songShown() }} aria-pressed={songShown()} aria-label="Song panel" title={songShown() ? 'Hide the song panel' : 'Show the song panel'} onClick={toggleSongPanel}>
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M1.5 2.8h7v2.4h-7zM5.5 6.8h9v2.4h-9zM2.5 10.8h6v2.4h-6z" />
                    </svg>
                </button>
            </div>
            <div class="seg">
                <For each={VIEWS}>
                    {(view) => (
                        <button classList={{ on: viewMode() === view.id }} aria-pressed={viewMode() === view.id} onClick={() => setView(view.id)}>
                            {view.label}
                        </button>
                    )}
                </For>
            </div>
            <button class="ib who" classList={{ in: Boolean(me()) }} aria-label="Your account" title={me() ? `Your account on the Weft site: ${me()!.name}` : 'Your account on the Weft site: sign in, or make one'} onClick={openAccount}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                    <circle class="ln" cx="8" cy="5.5" r="2.7" />
                    <path class="ln" d="M2.7 13.6c.6-3 2.7-4.3 5.3-4.3s4.7 1.3 5.3 4.3" />
                </svg>
            </button>
            <Show when={startOpen() ? null : songNote()}>
                {(note) => (
                    <p class="top-note" role="status" data-testid="song-note" ref={said}>
                        <span>{note()}</span>
                        <button class="rx" aria-label="Put this away" onClick={dismissSongNote}>
                            <svg viewBox="0 0 8 8">
                                <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
                            </svg>
                        </button>
                    </p>
                )}
            </Show>
        </header>
    )
}
