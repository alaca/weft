import { createMemo, createResource, For, Show } from 'solid-js'
import { audioFits, audioPlace, barSecondsNow, hearAudio, nudgeAudio, refitAudio, setAudioFade, setAudioHeard, setAudioStart, slicePeaks, songLengthNow } from '../app/controller'
import { barsOf } from '../song/arrange'
import { heardIn, readLaid } from '../song/audio'
import type { PatternBlock } from '../song/types'
import { engineState, ownSounds, stale, tempoLane } from '../stores/song'

const WIDE = 1000
const HIGH = 72
// A line for every bar while there is room for them, and for every few bars after that.
const MOST_LINES = 48
const NUDGE = 0.01

// A recording that plays along the song. Its shape is drawn with the bars of the song over it,
// the part that is heard in the pattern's colour and the rest faint: a press plays it from
// there. Under it is where it begins, the bars it is heard in and how it fades. Cutting holes
// in it, and anything else that is done to bars, is done to its bars in the Song panel.
export function AudioRack(props: { id: string; block: PatternBlock; playing: boolean; position: number; cycle: number }) {
    const audio = createMemo(() => readLaid(props.block))
    const length = () => songLengthNow()
    const place = () => audioPlace(props.id) ?? 0
    const sound = () => audio()?.sound.value ?? ''
    const known = () => ownSounds().some((one) => one.name === sound())

    const [shape] = createResource(
        () => (engineState().sounds === 'loading' ? null : `${sound()}|${ownSounds().find((one) => one.name === sound())?.seconds ?? ''}`),
        (key) => slicePeaks(key.split('|')[0]),
    )
    const outline = () => {
        const peaks = shape()?.peaks ?? []
        const loudest = Math.max(0.001, ...peaks)
        const each = WIDE / Math.max(1, peaks.length)
        return peaks.map((peak, at) => `M${(at * each + each / 2).toFixed(1)} ${(HIGH / 2 - (peak / loudest) * (HIGH / 2 - 5)).toFixed(1)}V${(HIGH / 2 + (peak / loudest) * (HIGH / 2 - 5)).toFixed(1)}`).join('')
    }

    // Which bars of the song play some of it, and so the first and the last of them.
    const heard = createMemo(() => {
        const now = audio()
        return now ? heardIn(now.list, now.bars, barsOf(props.block, Math.max(length(), now.list.length))) : []
    })
    const first = () => heard().indexOf(true)
    const last = () => heard().lastIndexOf(true)

    // The bars of the recording across the picture: where each begins, as a part of the whole,
    // the bar of the song it is in, and whether it is heard.
    const pieces = createMemo(() => {
        const now = audio()
        if (!now) return []
        const count = Math.ceil(now.bars)
        const every = Math.max(1, Math.ceil(count / MOST_LINES))
        return Array.from({ length: count }, (_, piece) => {
            const bar = now.list.indexOf(piece)
            return { piece, bar, from: piece / now.bars, wide: Math.min(1, (piece + 1) / now.bars) - piece / now.bars, on: bar >= 0 && Boolean(heard()[bar]), line: piece % every === 0 }
        })
    })
    // Where the song is in the recording, as a part of its whole length.
    const head = createMemo(() => {
        const now = audio()
        if (!now || !props.playing) return null
        // A bar of the recording that begins after the bar line is still playing when the next
        // bar of the song begins.
        const begun = props.position >= now.lateBy
        const bar = begun ? props.cycle : props.cycle - 1
        const piece = bar >= 0 && heard()[bar % Math.max(1, heard().length)] ? now.list[bar % now.list.length] : null
        if (piece === null || piece === undefined) return null
        const at = (piece + props.position - now.lateBy + (begun ? 0 : 1)) / now.bars
        return at >= 0 && at <= 1 ? at : null
    })

    const number = (event: Event & { currentTarget: HTMLInputElement }) => Number(event.currentTarget.value)
    const late = () => (audio()?.lateBy ?? 0) * barSecondsNow()

    return (
        <div class="rk al" onClick={(event) => event.stopPropagation()} data-testid={`audio-${props.id}`}>
            <div class="al-w" role="group" aria-label={`The recording ${sound()}`}>
                <svg viewBox={`0 0 ${WIDE} ${HIGH}`} preserveAspectRatio="none" aria-hidden="true">
                    <path d={outline()} />
                </svg>
                <For each={pieces()}>
                    {(piece) => (
                        <button
                            class="al-p"
                            classList={{ on: piece.on, line: piece.line }}
                            style={{ left: `${piece.from * 100}%`, width: `${piece.wide * 100}%` }}
                            aria-label={piece.bar >= 0 ? `Hear it from bar ${piece.bar + 1}` : `Hear it from its bar ${piece.piece + 1}`}
                            title={piece.bar >= 0 ? `Bar ${piece.bar + 1} of the song${piece.on ? '' : ', where it is not heard'}. Press to hear it from here.` : 'Not in the song. Press to hear it from here.'}
                            onClick={() => hearAudio(props.id, piece.from)}
                        >
                            <Show when={piece.line && piece.bar >= 0}>
                                <b>{piece.bar + 1}</b>
                            </Show>
                        </button>
                    )}
                </For>
                <Show when={head() !== null}>
                    <i class="ph" style={{ left: `${(head() ?? 0) * 100}%` }} />
                </Show>
                <Show when={!known()}>
                    <p class="sl-n">{sound()} is not among your sounds on this machine, so nothing of it plays.</p>
                </Show>
                <Show when={known() && !shape.loading && !shape()}>
                    <p class="sl-n">The shape of this sound cannot be shown. It still plays.</p>
                </Show>
            </div>
            <div class="al-f">
                <label class="al-l">
                    <span class="cap">Starts at bar</span>
                    <input
                        class="al-i"
                        type="number"
                        min="1"
                        step="1"
                        aria-label="The bar it starts at"
                        value={Math.floor(place() + 1e-6) + 1}
                        disabled={stale()}
                        onChange={(event) => setAudioStart(props.id, number(event) - 1)}
                    />
                </label>
                <span class="al-l">
                    <span class="cap">Nudge</span>
                    <button class="chip tgl" disabled={stale() || place() <= 0} aria-label="Earlier by 10 milliseconds" title="Earlier by 10 milliseconds. For a take that was sung a little late." onClick={() => nudgeAudio(props.id, -NUDGE)}>
                        Earlier
                    </button>
                    <button class="chip tgl" disabled={stale()} aria-label="Later by 10 milliseconds" title="Later by 10 milliseconds" onClick={() => nudgeAudio(props.id, NUDGE)}>
                        Later
                    </button>
                    <Show when={late() > 0.0005}>
                        <span class="al-t" data-testid="audio-late">
                            {Math.round(late() * 1000)} ms after the bar
                        </span>
                    </Show>
                </span>
                <span class="al-l">
                    <span class="cap">Heard from bar</span>
                    <input
                        class="al-i"
                        type="number"
                        min="1"
                        step="1"
                        aria-label="The first bar it is heard in"
                        value={first() < 0 ? '' : first() + 1}
                        disabled={stale()}
                        onChange={(event) => setAudioHeard(props.id, number(event) - 1, Math.max(number(event) - 1, last()))}
                    />
                    <span class="cap">to</span>
                    <input
                        class="al-i"
                        type="number"
                        min="1"
                        step="1"
                        aria-label="The last bar it is heard in"
                        value={last() < 0 ? '' : last() + 1}
                        disabled={stale()}
                        onChange={(event) => setAudioHeard(props.id, first() < 0 ? number(event) - 1 : Math.min(first(), number(event) - 1), number(event) - 1)}
                    />
                </span>
                <label class="al-l" title="How long it takes to come in, where it begins to be heard. At most a bar.">
                    <span class="cap">Fade in</span>
                    <input
                        class="al-i"
                        type="number"
                        min="0"
                        max="30"
                        step="0.1"
                        aria-label="Fade in, in seconds"
                        value={audio()?.fadeIn ?? 0}
                        disabled={stale()}
                        onChange={(event) => setAudioFade(props.id, 'in', number(event))}
                    />
                    <span class="al-t">s</span>
                </label>
                <label class="al-l" title="How long it takes to go out, after the last bar it is heard in. It goes on for that long with what the recording has there.">
                    <span class="cap">Fade out</span>
                    <input
                        class="al-i"
                        type="number"
                        min="0"
                        max="30"
                        step="0.1"
                        aria-label="Fade out, in seconds"
                        value={audio()?.fadeOut ?? 0}
                        disabled={stale()}
                        onChange={(event) => setAudioFade(props.id, 'out', number(event))}
                    />
                    <span class="al-t">s</span>
                </label>
            </div>
            <Show when={!audioFits(props.id)}>
                <p class="al-n" data-testid="audio-unfit">
                    The tempo is not the one this recording was laid out at, so its bars no longer join.
                    <button class="chip tgl" disabled={stale()} onClick={refitAudio}>
                        Lay it out again
                    </button>
                </p>
            </Show>
            <Show when={tempoLane()}>
                <p class="al-n">The tempo of this song is drawn bar by bar. A recording keeps the speed it was made at, so it is in time only where the tempo is the one written for the song.</p>
            </Show>
            <p class="rk-n">Fill or empty its bars in the Song panel to cut it anywhere. Its volume can be drawn over the song there as well.</p>
        </div>
    )
}
