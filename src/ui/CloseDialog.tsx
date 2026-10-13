import { onCleanup, onMount, Show } from 'solid-js'
import { closeSaved, closeUnsaved, keepOpen } from '../app/controller'
import { closingSong, currentSong } from '../stores/song'

// Asked when a song with changes since it was saved is closed. Saving keeps them, and closing
// without saving takes the song back to the version that was saved.
export function CloseDialog() {
    const escape = (event: KeyboardEvent) => {
        if (closingSong() && event.key === 'Escape') keepOpen()
    }
    onMount(() => document.addEventListener('keydown', escape))
    onCleanup(() => document.removeEventListener('keydown', escape))

    return (
        <Show when={closingSong()}>
            <div
                class="veil"
                onPointerDown={(event) => {
                    if (event.target === event.currentTarget) keepOpen()
                }}
            >
                <div class="xp" role="alertdialog" aria-modal="true" aria-label={`Save the changes to ${currentSong()?.name ?? ''}?`} data-testid="close-song">
                    <div class="xp-h">
                        <h2>
                            Save the changes to <b>{currentSong()?.name}</b>?
                        </h2>
                    </div>
                    <p class="pb-t">It has changes since it was saved. Closing without saving drops them: the song goes back to the version that was saved.</p>
                    <div class="xp-f">
                        <button class="btn" onClick={keepOpen}>
                            Cancel
                        </button>
                        <span class="grow" />
                        <button class="btn" onClick={closeUnsaved}>
                            Close without saving
                        </button>
                        <button class="btn go" onClick={closeSaved}>
                            Save and close
                        </button>
                    </div>
                </div>
            </div>
        </Show>
    )
}
