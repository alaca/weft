import { Show } from 'solid-js'
import { answerAsk } from '../app/jam'
import { jamAsks, jamStage } from '../stores/jam'
import { currentSong } from '../stores/song'
import { hueOf, letter } from './JamPanel'

// Someone read the list of open jams and asks to join yours. It is asked wherever you are in
// the app, one person at a time, and nothing is shared until you say so.
export function JamAsk() {
    const first = () => (jamStage() === 'waiting' ? jamAsks()[0] : undefined)
    const more = () => jamAsks().length - 1

    return (
        <Show when={first()}>
            {(one) => (
                <div class="ja" role="status" aria-label={`${one().name} asks to join your song`} data-testid="jam-ask">
                    <i style={{ '--who': hueOf(one().name) }}>{letter(one().name)}</i>
                    <div class="ja-b">
                        <h3>{one().name} asks to join your song</h3>
                        <p>
                            They will see {currentSong()?.name} and can change it with you. You both keep a copy when the jam ends.
                        </p>
                        <div class="ja-a">
                            <button class="btn go" onClick={() => answerAsk(one().ask, 'let')}>
                                Let them in
                            </button>
                            <button class="btn" onClick={() => answerAsk(one().ask, 'deny')}>
                                Not now
                            </button>
                            <span class="grow" />
                            <button class="ja-x" title="Says no, and brings you no more questions from them while you wait in this jam." onClick={() => answerAsk(one().ask, 'block')}>
                                Block
                            </button>
                        </div>
                        <Show when={more() > 0}>
                            <p class="ja-m">{more() === 1 ? 'One more person is asking.' : `${more()} more people are asking.`}</p>
                        </Show>
                    </div>
                </div>
            )}
        </Show>
    )
}
