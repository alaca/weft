import { For } from 'solid-js'
import { play, stop } from '../app/controller'
import { beat, bpm, cycle, engineState, setViewMode, viewMode, type ViewMode } from '../stores/song'

const VIEWS: { id: ViewMode; label: string }[] = [
    { id: 'controls', label: 'Controls' },
    { id: 'both', label: 'Both' },
    { id: 'code', label: 'Code' },
]

export function TopBar() {
    return (
        <header class="top" data-testid="top">
            <div class="word">Weft</div>
            <div class="proj">
                <b>Untitled</b>
            </div>
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
                    <b data-testid="tempo">{Math.round(bpm())}</b>
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
            <div class="seg">
                <For each={VIEWS}>
                    {(view) => (
                        <button classList={{ on: viewMode() === view.id }} aria-pressed={viewMode() === view.id} onClick={() => setViewMode(view.id)}>
                            {view.label}
                        </button>
                    )}
                </For>
            </div>
        </header>
    )
}
