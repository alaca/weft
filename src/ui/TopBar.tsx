import { For } from 'solid-js'
import { setMasterVolume, setPlayMode, setTempo, setView, stop, togglePlay, toggleSongPanel, toggleSounds, toggleWaveform } from '../app/controller'
import type { ControlView } from '../controls/views'
import { beat, bpm, cycle, engineState, masterVolume, playMode, song, songShown, soundsOpen, stale, viewMode, waveShown, type PlayMode, type ViewMode } from '../stores/song'
import { Knob } from './Knob'
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
    const volume = (): ControlView => ({
        fn: 'master',
        label: 'Volume',
        group: 'effects',
        describe: 'How loud everything is. This is your listening volume, not part of the song.',
        state: 'number',
        value: masterVolume(),
        min: 0,
        max: 1.5,
        scale: 'linear',
        text: `${Math.round(masterVolume() * 100)}%`,
    })

    return (
        <header class="top" data-testid="top">
            <div class="word">Weft</div>
            <SongMenu />
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
            <span class="mix">
                <Knob small name="Master volume" view={volume()} onChange={setMasterVolume} />
            </span>
            <div class="grow" />
            <div class="shows">
                <button class="ib" classList={{ on: soundsOpen() }} aria-pressed={soundsOpen()} aria-label="Sounds" title={soundsOpen() ? 'Hide the sounds' : 'Show the sounds'} onClick={toggleSounds}>
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path class="ln" d="M2.5 8h1.4M6 4.5v7M8.6 2.5v11M11.2 5.5v5M13.6 8h.4" />
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
        </header>
    )
}
