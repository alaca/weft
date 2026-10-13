import { For, onCleanup, onMount, Show } from 'solid-js'
import { changeMix, levelsOf, resetMix, toggleMixer, openSoundSettings } from '../app/controller'
import { DEMO } from '../demo/demo'
import type { ControlView } from '../controls/views'
import { isUsualMix, METER_MARKS, meterShare, panText, settle, shareOf, toneText, TONE_MOST, VOLUME_MOST, volumeText, type Mix } from '../library/mix'
import { mixerOpen, mixNow } from '../stores/song'
import { Fader } from './Fader'
import { Fold, isFolded } from './Fold'
import { Knob } from './Knob'

const HOLD = 1200
const SIDES = ['Left', 'Right']
const TONES: { key: 'low' | 'mid' | 'high'; label: string; about: string }[] = [
    { key: 'low', label: 'Low', about: 'More or less of the low end: the kick and the bass' },
    { key: 'mid', label: 'Mid', about: 'More or less of the middle, where most of a melody sits' },
    { key: 'high', label: 'High', about: 'More or less of the top: hats, air and the edge of a sound' },
]

// The two bars of a desk: how loud the left and the right side are at this moment, with a mark
// that stays for a moment at the loudest each has been. They are moved as the sound is, many
// times a second, so they are written straight onto the page.
function Meters() {
    const bars: HTMLElement[] = []
    const marks: HTMLElement[] = []
    const shown = [0, 0]
    const most = [0, 0]
    const since = [0, 0]
    let frame = 0
    let before = 0

    const draw = (time: number) => {
        const heard = (document.hidden ? null : levelsOf()) ?? [0, 0]
        const seconds = before ? (time - before) / 1000 : 0
        before = time
        heard.forEach((level, side) => {
            shown[side] = settle(shown[side], meterShare(level), seconds)
            if (shown[side] >= most[side]) {
                most[side] = shown[side]
                since[side] = time
            } else if (time - since[side] > HOLD) {
                most[side] = settle(most[side], shown[side], seconds)
            }
            bars[side].style.height = `${(1 - shown[side]) * 100}%`
            marks[side].style.bottom = `${most[side] * 100}%`
            marks[side].style.opacity = most[side] > 0.004 ? '1' : '0'
            bars[side].parentElement!.dataset.over = most[side] > shareOf(0) ? 'yes' : 'no'
        })
        frame = requestAnimationFrame(draw)
    }
    onMount(() => (frame = requestAnimationFrame(draw)))
    onCleanup(() => cancelAnimationFrame(frame))

    return (
        <div class="vu" role="img" aria-label="How loud the left and the right side are" data-testid="meters">
            <div class="vu-s" aria-hidden="true">
                <For each={METER_MARKS}>{(mark) => <span style={{ bottom: `${shareOf(mark) * 100}%` }}>{mark > 0 ? `+${mark}` : mark}</span>}</For>
            </div>
            <For each={SIDES}>
                {(side, at) => (
                    <div class="vu-b" title={side}>
                        <i class="vu-d" ref={(el) => (bars[at()] = el)} />
                        <i class="vu-p" ref={(el) => (marks[at()] = el)} />
                    </div>
                )}
            </For>
        </div>
    )
}

const view = (label: string, describe: string, value: number, min: number, max: number, text: string): ControlView => ({ fn: 'mix', label, group: 'effects', describe, state: 'number', value, min, max, scale: 'linear', text })

// The mixer: what stands between the song and your speakers. It is how the song sounds on this
// machine, like the volume it holds, and no part of the song.
export function MixerPanel() {
    const mix = (): Mix => mixNow()
    return (
        <Show when={mixerOpen()}>
            <aside class="mx" classList={{ folded: isFolded('mixer') }} aria-label="Mixer" data-testid="mixer">
                <div class="jm-h">
                    <Fold panel="mixer" name="the mixer" />
                    <h2>Mixer</h2>
                    <span class="grow" />
                    <button class="chip tgl" title="Sound settings: which microphone is used and what the app plays through" onClick={openSoundSettings}>
                        Devices
                    </button>
                    <button class="chip tgl" disabled={isUsualMix(mix())} title="Put everything back where it usually is" onClick={resetMix}>
                        Reset
                    </button>
                    <button class="ib" aria-label="Close mixer" onClick={toggleMixer}>
                        <svg viewBox="0 0 16 16">
                            <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                        </svg>
                    </button>
                </div>
                <div class="mx-b">
                    <div class="mx-k">
                        <Knob name="Pan" view={view('Pan', 'Moves the whole song to the left or the right', mix().pan, -1, 1, panText(mix().pan))} onChange={(pan) => changeMix({ pan })} />
                        <For each={TONES}>
                            {(tone) => <Knob name={tone.label} view={view(tone.label, tone.about, mix()[tone.key], -TONE_MOST, TONE_MOST, toneText(mix()[tone.key]))} onChange={(value) => changeMix({ [tone.key]: value })} />}
                        </For>
                        <button
                            class="chip tgl"
                            classList={{ on: mix().limit }}
                            aria-pressed={mix().limit}
                            title="Holds back the loudest moments, so that a loud song does not distort"
                            onClick={() => changeMix({ limit: !mix().limit })}
                        >
                            Limiter
                        </button>
                    </div>
                    <div class="mx-v">
                        <Fader name="Master volume" value={mix().volume} min={0} max={VOLUME_MOST} usual={1} text={volumeText(mix().volume)} about="How loud everything is. Double click for 100%." onChange={(volume) => changeMix({ volume })} />
                        <b data-testid="mixer-volume">{volumeText(mix().volume)}</b>
                        <span class="cap">Volume</span>
                    </div>
                    <Meters />
                </div>
                <p class="jm-note mx-n">How the song sounds on this machine. It is not part of the song{DEMO ? '.' : ': a file you export, and someone you jam with, get the song without it.'}</p>
            </aside>
        </Show>
    )
}
