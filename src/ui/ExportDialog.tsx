import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js'
import { closeExport, exportAudio, exportCode, keptAudio, saveSongFile, songLengthNow } from '../app/controller'
import { durationText, FORMATS, gradeOf, QUALITIES, RING_SECONDS, sizeOf, sizeText, type AudioOptions, type Format, type Quality } from '../library/audio'
import { bpm, currentSong, engineState, exporting, exportNote, exportOpen } from '../stores/song'

const FORMAT_LABELS: Record<Format, string> = { wav: 'WAV', mp3: 'MP3' }
const QUALITY_LABELS: Record<Quality, string> = { standard: 'Standard', high: 'High', highest: 'Highest' }

export function ExportDialog() {
    let box: HTMLDivElement | undefined
    const [options, setOptions] = createSignal<AudioOptions>(keptAudio())

    createEffect(
        on(exportOpen, (open) => {
            if (!open) return
            setOptions(keptAudio())
            queueMicrotask(() => box?.focus())
        }),
    )

    const seconds = () => (songLengthNow() * 240) / bpm()
    const ready = () => !exporting() && !engineState().error

    const escape = (event: KeyboardEvent) => {
        if (exportOpen() && event.key === 'Escape' && !exporting()) closeExport()
    }
    onMount(() => document.addEventListener('keydown', escape))
    onCleanup(() => document.removeEventListener('keydown', escape))

    return (
        <Show when={exportOpen()}>
            <div
                class="veil"
                onPointerDown={(event) => {
                    if (event.target === event.currentTarget && !exporting()) closeExport()
                }}
            >
                <div class="xp" role="dialog" aria-modal="true" aria-label={`Export ${currentSong()?.name ?? ''}`} data-testid="export" tabindex="-1" ref={box}>
                    <div class="xp-h">
                        <h2>
                            Export <b>{currentSong()?.name}</b>
                        </h2>
                        <span class="grow" />
                        <button class="ib" aria-label="Close export" disabled={exporting()} onClick={closeExport}>
                            <svg viewBox="0 0 16 16">
                                <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                            </svg>
                        </button>
                    </div>

                    <div class="xp-r">
                        <span class="xp-l">Format</span>
                        <div class="seg" role="group" aria-label="Format">
                            <For each={FORMATS}>
                                {(format) => (
                                    <button classList={{ on: options().format === format }} aria-pressed={options().format === format} disabled={exporting()} onClick={() => setOptions({ ...options(), format })}>
                                        {FORMAT_LABELS[format]}
                                    </button>
                                )}
                            </For>
                        </div>
                    </div>
                    <div class="xp-r">
                        <span class="xp-l">Quality</span>
                        <div class="seg" role="group" aria-label="Quality">
                            <For each={QUALITIES}>
                                {(quality) => (
                                    <button classList={{ on: options().quality === quality }} aria-pressed={options().quality === quality} disabled={exporting()} onClick={() => setOptions({ ...options(), quality })}>
                                        {QUALITY_LABELS[quality]}
                                    </button>
                                )}
                            </For>
                        </div>
                    </div>
                    <p class="xp-s" data-testid="export-size">
                        {gradeOf(options()).about}. The whole song, {durationText(seconds())}, about {sizeText(sizeOf(options(), seconds() + RING_SECONDS / 2))}.
                    </p>

                    <p class="xp-n" role="status" data-testid="export-note">
                        <Show when={exportNote()} fallback={engineState().error ? 'The code has an error, so the song cannot be made into audio. The code itself can still be saved.' : ''}>
                            {exportNote()}
                        </Show>
                    </p>
                    <div class="xp-f">
                        <button class="btn" disabled={exporting()} title="The song with your own sounds inside it, to open in this app again" onClick={() => void saveSongFile()}>
                            Song file (.weft)
                        </button>
                        <button class="btn" disabled={exporting()} title="Only the code, as text" onClick={() => void exportCode()}>
                            Code (.js)
                        </button>
                        <span class="grow" />
                        <button class="btn" disabled={exporting()} onClick={closeExport}>
                            Close
                        </button>
                        <button class="btn go" disabled={!ready()} onClick={() => void exportAudio(options())}>
                            {exporting() ? 'Working' : 'Export audio'}
                        </button>
                    </div>
                </div>
            </div>
        </Show>
    )
}
