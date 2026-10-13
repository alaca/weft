import { createResource, createSignal, onCleanup, onMount, Show, For } from 'solid-js'
import { chooseInput, chooseOutput, closeSoundSettings, testOutput } from '../app/controller'
import { askForNames, listInputs, listOutputs, outputRoute } from '../library/soundDevices'
import { chooseClock, midiOutputs } from '../app/controller'
import { bindings, forgetKnob, knobName, learnKnobs } from '../app/knobs'
import { hearKeyboards } from '../app/piano'
import { canHearMidi, canSendClock } from '../library/midi'
import { midiKeyboards, soundChoice, soundOpen } from '../stores/song'

const SYSTEM = ''

// Which microphone the app records from and what it plays through. Both are the system's own
// until something else is chosen here, and go back to it when what was chosen is unplugged.
export function SoundDialog() {
    return (
        <Show when={soundOpen()}>
            <Settings />
        </Show>
    )
}

function Settings() {
    const [asked, setAsked] = createSignal(0)
    const [inputs] = createResource(asked, () => listInputs())
    const [outputs] = createResource(asked, () => listOutputs())
    const [note, setNote] = createSignal('')
    const route = outputRoute()
    const [clockOutputs, { refetch: refetchClock }] = createResource(() => (canSendClock() ? midiOutputs() : []))
    // An output that was chosen stays in the list while it is unplugged, so that it stays chosen.
    const clockNames = () => {
        const chosen = soundChoice().clock
        return [...new Set([...(clockOutputs() ?? []), ...(chosen.kind === 'named' ? [chosen.name] : [])])]
    }

    const escape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') closeSoundSettings()
    }
    // What is plugged in changes while the window is open.
    const again = () => setAsked(asked() + 1)
    onMount(() => {
        document.addEventListener('keydown', escape)
        navigator.mediaDevices?.addEventListener?.('devicechange', again)
        void hearKeyboards()
    })
    onCleanup(() => {
        document.removeEventListener('keydown', escape)
        navigator.mediaDevices?.removeEventListener?.('devicechange', again)
    })

    const inputGone = () => soundChoice().input !== null && inputs() !== undefined && !inputs()!.devices.some((device) => device.id === soundChoice().input)
    const outputGone = () => soundChoice().output !== null && outputs() !== undefined && !outputs()!.devices.some((device) => device.id === soundChoice().output)

    const pickOutput = async (id: string) => {
        const device = outputs()?.devices.find((one) => one.id === id) ?? null
        setNote('')
        if (!(await chooseOutput(id === SYSTEM ? null : device))) setNote('That output could not be played through, so the sound stays where it was.')
    }
    const show = async () => {
        setNote('')
        if (!(await askForNames())) return void setNote('The microphone was not allowed, so the window was not told what it could play through. Allow it in the system’s settings for Weft Loom, then press Show the outputs again.')
        again()
    }

    return (
        <div
            class="veil"
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) closeSoundSettings()
            }}
        >
            <div class="xp" role="dialog" aria-modal="true" aria-label="Sound settings" data-testid="sound-settings">
                <div class="xp-h">
                    <h2>Sound settings</h2>
                </div>

                <label class="sd-r">
                    <span>Microphone</span>
                    <select class="sd-s" aria-label="Microphone" value={inputGone() ? SYSTEM : (soundChoice().input ?? SYSTEM)} onChange={(event) => chooseInput(event.currentTarget.value || null)}>
                        <option value={SYSTEM}>The system’s{inputs()?.usual ? ` (${inputs()!.usual})` : ''}</option>
                        <For each={inputs()?.devices ?? []}>{(device) => <option value={device.id}>{device.name}</option>}</For>
                    </select>
                </label>
                <p class="sd-t">
                    Used for a take and for your voice in a jam.
                    <Show when={inputGone()}> The one that was chosen is not plugged in, so the system’s is used.</Show>
                    <Show when={inputs() && !inputs()!.named}> The window is told which microphones there are once it has used one: record a take, then open this again.</Show>
                </p>

                <label class="sd-r">
                    <span>Output</span>
                    <select
                        class="sd-s"
                        aria-label="Output"
                        disabled={route === null || !(outputs()?.devices.length ?? 0)}
                        value={outputGone() ? SYSTEM : (soundChoice().output ?? SYSTEM)}
                        onChange={(event) => void pickOutput(event.currentTarget.value)}
                    >
                        <option value={SYSTEM}>The system’s output</option>
                        <For each={outputs()?.devices ?? []}>{(device) => <option value={device.id}>{device.name}</option>}</For>
                    </select>
                    <button class="btn" title="Plays a short note, to hear where the sound comes out" onClick={testOutput}>
                        Test
                    </button>
                </label>
                <p class="sd-t" data-testid="sound-output-note">
                    <Show when={route === null}>This window cannot choose what it plays through. It plays through the output chosen in the system’s sound settings.</Show>
                    <Show when={route !== null && outputs() && !outputs()!.devices.length}>
                        The window is told what it could play through only once it may use the microphone. Nothing is recorded. <button onClick={() => void show()}>Show the outputs</button>
                    </Show>
                    <Show when={route !== null && (outputs()?.devices.length ?? 0) > 0}>
                        What the song and every sound you listen to are played through.
                        <Show when={route === 'element'}> Through an output chosen here the sound comes a moment later than through the system’s.</Show>
                        <Show when={outputGone()}> The one that was chosen ({soundChoice().outputName ?? 'unnamed'}) is not there, so the system’s is used.</Show>
                    </Show>
                </p>
                <div class="sd-r">
                    <span>MIDI</span>
                    <b class="sd-m" data-testid="sound-midi">{midiKeyboards()?.length ? midiKeyboards()!.join(', ') : 'No keyboard plugged in'}</b>
                </div>
                <p class="sd-t">
                    <Show when={canHearMidi()} fallback={<>This window cannot reach a MIDI keyboard. The desktop app can.</>}>
                        A MIDI keyboard or pad is heard as soon as it is plugged in. It plays the pattern you are on: its notes, or the sounds of a drum grid. With Keys on at a piano roll, what you play while the song plays is written into it.
                    </Show>
                </p>
                <Show when={canSendClock()}>
                    <label class="sd-r">
                        <span>Clock</span>
                        <select
                            class="sd-s"
                            aria-label="Where the tempo is sent as a MIDI clock"
                            value={soundChoice().clock.kind === 'named' ? `to:${(soundChoice().clock as { name: string }).name}` : soundChoice().clock.kind}
                            onFocus={() => refetchClock()}
                            onChange={(event) => {
                                const chosen = event.currentTarget.value
                                chooseClock(chosen === 'off' ? { kind: 'off' } : chosen === 'first' ? { kind: 'first' } : { kind: 'named', name: chosen.slice(3) })
                            }}
                        >
                            <option value="off">Not sent</option>
                            <option value="first">To the first MIDI output there is</option>
                            <For each={clockNames()}>{(name) => <option value={`to:${name}`}>To {name}</option>}</For>
                        </select>
                    </label>
                    <p class="sd-t">The tempo of the song as a MIDI clock, with its start and its stop, for a drum machine or a synth that follows one.</p>
                </Show>
                <Show when={canHearMidi()}>
                    <div class="sd-r">
                        <span>Knobs</span>
                        <button
                            class="btn sd-b"
                            title="Teaches the knobs and faders of a MIDI controller to turn knobs of the app"
                            onClick={() => {
                                closeSoundSettings()
                                learnKnobs(true)
                            }}
                        >
                            Learn the knobs of a controller
                        </button>
                    </div>
                    <ul class="sd-k" aria-label="Knobs of a controller that turn knobs of the app">
                        <For each={Object.entries(bindings())}>
                            {([from, to]) => (
                                <li>
                                    <span>
                                        {to.label}, by {knobName(from)}
                                    </span>
                                    <button class="rx" aria-label={`Forget ${knobName(from)}`} title="Forget it" onClick={() => forgetKnob(from)}>
                                        <svg viewBox="0 0 8 8">
                                            <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
                                        </svg>
                                    </button>
                                </li>
                            )}
                        </For>
                    </ul>
                </Show>
                <p class="xp-n" role="status" data-testid="sound-note">
                    {note()}
                </p>
                <div class="xp-f">
                    <span class="grow" />
                    <button class="btn go" onClick={closeSoundSettings}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    )
}
