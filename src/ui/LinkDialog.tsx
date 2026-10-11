import { onCleanup, onMount, Show } from 'solid-js'
import { dropAsked, openAsked } from '../app/controller'
import { linkAsk } from '../stores/song'

// Asked when a link, pressed on some page, wants the app to open a song from the site. A link
// can be pressed by accident or put where it is not expected, so the song is only opened on a
// yes, and what is open stays as it is either way.
export function LinkDialog() {
    const escape = (event: KeyboardEvent) => {
        if (linkAsk() && event.key === 'Escape') dropAsked()
    }
    onMount(() => document.addEventListener('keydown', escape))
    onCleanup(() => document.removeEventListener('keydown', escape))

    return (
        <Show when={linkAsk()}>
            {(asked) => (
                <div
                    class="veil"
                    onPointerDown={(event) => {
                        if (event.target === event.currentTarget) dropAsked()
                    }}
                >
                    <div class="xp" role="alertdialog" aria-modal="true" aria-label={`Open ${asked().name}?`} data-testid="link-ask">
                        <div class="xp-h">
                            <h2>
                                Open <b>{asked().name}</b>
                                {asked().by ? ` by ${asked().by}` : ''}?
                            </h2>
                        </div>
                        <p class="pb-t">A link asked Weft to open this song from the site. It opens as a new song among yours, and is only played while all of it is music code. The song you have open stays with your songs as it is.</p>
                        <div class="xp-f">
                            <button class="btn" onClick={dropAsked}>
                                Cancel
                            </button>
                            <span class="grow" />
                            <button class="btn go" onClick={() => void openAsked()}>
                                Open it
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Show>
    )
}
