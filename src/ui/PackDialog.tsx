import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { makePack } from '../app/controller'
import { lengthText } from '../library/sounds'
import { ownPresets, ownSounds } from '../stores/song'

// A pack is made from sounds and presets of your own: which of them, under what name and by
// whom. It is saved as one file to give to others, and whoever adds it to their app has
// its sounds in every song.
export function PackDialog(props: { onClose: () => void }) {
    const mine = () => ownSounds().filter((sound) => !sound.pack)
    const [name, setName] = createSignal('')
    const [by, setBy] = createSignal('')
    const [about, setAbout] = createSignal('')
    const [sounds, setSounds] = createSignal<string[]>(mine().map((sound) => sound.name))
    const [presets, setPresets] = createSignal<string[]>(ownPresets().map((preset) => preset.id))
    const [note, setNote] = createSignal('')
    const [busy, setBusy] = createSignal(false)
    const flip = (list: string[], one: string) => (list.includes(one) ? list.filter((other) => other !== one) : [...list, one])

    const escape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') props.onClose()
    }
    onMount(() => document.addEventListener('keydown', escape))
    onCleanup(() => document.removeEventListener('keydown', escape))

    const save = async () => {
        setBusy(true)
        setNote('Making the pack.')
        setNote(await makePack({ name: name(), by: by(), about: about(), sounds: sounds(), presets: presets() }))
        setBusy(false)
    }

    return (
        <div
            class="veil"
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) props.onClose()
            }}
        >
            <div class="xp" role="dialog" aria-modal="true" aria-label="Make a pack" data-testid="pack-make">
                <div class="xp-h">
                    <h2>Make a pack</h2>
                </div>
                <p class="pb-t">A pack is one file with sounds and presets of yours in it. Whoever adds it to their Weft Loom has them in every song. A song that uses a pack does not carry its sounds along: it says which pack it needs.</p>
                <div class="pk-f">
                    <input class="br-s" aria-label="Name of the pack" placeholder="Name of the pack" maxLength={60} value={name()} onInput={(event) => setName(event.currentTarget.value)} />
                    <input class="br-s" aria-label="Who made it" placeholder="Who made it" maxLength={40} value={by()} onInput={(event) => setBy(event.currentTarget.value)} />
                    <input class="br-s" aria-label="A line about it" placeholder="A line about it" maxLength={300} value={about()} onInput={(event) => setAbout(event.currentTarget.value)} />
                </div>
                <div class="pk-h">
                    <span>
                        Sounds, {sounds().length} of {mine().length}
                    </span>
                    <span class="grow" />
                    <button onClick={() => setSounds(sounds().length ? [] : mine().map((sound) => sound.name))}>{sounds().length ? 'None' : 'All'}</button>
                </div>
                <Show when={mine().length} fallback={<p class="pb-t">You have no sounds of your own yet. Add audio files or record under Yours first.</p>}>
                    <div class="pk-c" role="group" aria-label="Sounds to put in the pack">
                        <For each={mine()}>
                            {(sound) => (
                                <label>
                                    <input type="checkbox" checked={sounds().includes(sound.name)} onChange={() => setSounds(flip(sounds(), sound.name))} />
                                    {sound.name}
                                    <span>{lengthText(sound.seconds)}</span>
                                </label>
                            )}
                        </For>
                    </div>
                </Show>
                <Show when={ownPresets().length}>
                    <div class="pk-h">
                        <span>
                            Presets, {presets().length} of {ownPresets().length}
                        </span>
                    </div>
                    <div class="pk-c" role="group" aria-label="Presets to put in the pack">
                        <For each={ownPresets()}>
                            {(preset) => (
                                <label>
                                    <input type="checkbox" checked={presets().includes(preset.id)} onChange={() => setPresets(flip(presets(), preset.id))} />
                                    {preset.name}
                                </label>
                            )}
                        </For>
                    </div>
                </Show>
                <p class="xp-n" role="status" data-testid="pack-made">
                    {note()}
                </p>
                <div class="xp-f">
                    <button class="btn" onClick={props.onClose}>
                        Close
                    </button>
                    <span class="grow" />
                    <button class="btn go" disabled={busy() || !name().trim() || (!sounds().length && !presets().length)} onClick={() => void save()}>
                        Save the pack
                    </button>
                </div>
            </div>
        </div>
    )
}
