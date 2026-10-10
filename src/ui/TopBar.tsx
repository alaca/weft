import { For } from 'solid-js'
import { play, setMasterVolume, setTempo, stop, toggleSounds } from '../app/controller'
import type { ControlView } from '../controls/views'
import { beat, bpm, cycle, engineState, masterVolume, setViewMode, song, soundsOpen, stale, viewMode, type ViewMode } from '../stores/song'
import { Knob } from './Knob'
import { SongMenu } from './SongMenu'

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
                <button class="play" aria-label="Play" aria-pressed={engineState().playing} onClick={play}>
                    <svg viewBox="0 0 16 16">
                        <path d="M4.8 2.6v10.8L13.4 8z" />
                    </svg>
                </button>
                <button class="ib" aria-label="Stop" onClick={stop}>
                    <svg viewBox="0 0 16 16">
                        <rect x="3.6" y="3.6" width="8.8" height="8.8" rx="1.4" />
                    </svg>
                </button>
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
            <div class="seg">
                <For each={VIEWS}>
                    {(view) => (
                        <button classList={{ on: viewMode() === view.id }} aria-pressed={viewMode() === view.id} onClick={() => setViewMode(view.id)}>
                            {view.label}
                        </button>
                    )}
                </For>
            </div>
            <button class="btn" classList={{ on: soundsOpen() }} aria-pressed={soundsOpen()} onClick={toggleSounds}>
                <svg viewBox="0 0 14 14" aria-hidden="true">
                    <path d="M2 7h1.5M5 4v6M7.5 2v10M10 5v4M12.2 7h.3" />
                </svg>
                Sounds
            </button>
        </header>
    )
}
