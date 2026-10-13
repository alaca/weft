import { Match, Show, Switch } from 'solid-js'
import { installNewVersion, putUpdateOff } from '../app/update'
import { jamming } from '../stores/jam'
import { updateDone, updateNote, updateNotes, updateStage, updateVersion } from '../stores/update'

// A newer version of the app, offered in a corner of the window: what it is, a button that
// fetches it and starts it, and how far along that is.
export function UpdateCard() {
    return (
        <Show when={updateStage() !== 'none'}>
            <div class="up" role="status" aria-label="A newer version of Weft Loom" data-testid="update">
                <Switch>
                    <Match when={updateStage() === 'said'}>
                        <p>{updateNote()}</p>
                        <div class="up-a">
                            <button class="btn" onClick={putUpdateOff}>
                                OK
                            </button>
                        </div>
                    </Match>
                    <Match when={updateStage() === 'fetching'}>
                        <h3>Fetching Weft Loom {updateVersion()}</h3>
                        <div class="up-p" role="progressbar" aria-label="How much is fetched" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(updateDone() * 100)}>
                            <i style={{ width: `${updateDone() * 100}%` }} />
                        </div>
                        <p>Weft Loom starts again by itself when it is in place. Your song is kept.</p>
                    </Match>
                    <Match when={true}>
                        <h3>Weft Loom {updateVersion()} is out</h3>
                        <Show when={updateStage() === 'failed'} fallback={<Show when={updateNotes()}>{<p class="up-n">{updateNotes()}</p>}</Show>}>
                            <p>{updateNote()}</p>
                        </Show>
                        <div class="up-a">
                            <button class="btn go" disabled={jamming()} title={jamming() ? 'Updating starts Weft Loom again, which would end the jam. Leave the jam first.' : 'Fetches it and starts Weft Loom again. Your song is kept.'} onClick={() => void installNewVersion()}>
                                {updateStage() === 'failed' ? 'Try again' : 'Update and restart'}
                            </button>
                            <button class="btn" onClick={putUpdateOff}>
                                Later
                            </button>
                        </div>
                    </Match>
                </Switch>
            </div>
        </Show>
    )
}
