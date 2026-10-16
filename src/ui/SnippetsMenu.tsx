import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { allSnippets, insertSnippet, removeSnippet, saveSnippet, selectedCode } from '../app/controller'
import { NAME_MOST } from '../library/snippets'

const firstLine = (code: string) => code.trim().split('\n')[0]

// Your snippets and those the app comes with, put in where the cursor is with a press, and what
// is selected in the code kept as one more.
export function SnippetsMenu() {
    let root!: HTMLDivElement
    const [open, setOpen] = createSignal(false)
    const [chosen, setChosen] = createSignal('')
    const [name, setName] = createSignal('')
    const [note, setNote] = createSignal<string | null>(null)

    const toggle = () => {
        if (!open()) {
            setChosen(selectedCode())
            setNote(null)
        }
        setOpen(!open())
    }
    const away = (event: PointerEvent) => {
        if (open() && !root.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
        if (open() && event.key === 'Escape') setOpen(false)
    }
    onMount(() => {
        document.addEventListener('pointerdown', away)
        document.addEventListener('keydown', escape)
    })
    onCleanup(() => {
        document.removeEventListener('pointerdown', away)
        document.removeEventListener('keydown', escape)
    })
    const save = () => {
        const said = saveSnippet(name(), chosen())
        setNote(said)
        if (said.startsWith('Saved')) setName('')
    }

    return (
        <div class="snp-w" ref={root}>
            <button class="btn" aria-haspopup="dialog" aria-expanded={open()} title="Bits of code kept under a short name, to put in by typing the name" onClick={toggle}>
                Snippets
            </button>
            <Show when={open()}>
                <div class="sm snp" role="dialog" aria-label="Snippets">
                    <Show when={chosen().trim()} fallback={<p class="sm-note">Select code to keep it as a snippet. Type a snippet's name in the code and choose it from the list that opens, or press it here.</p>}>
                        <h4>Keep what is selected</h4>
                        <pre class="snp-c">{chosen().length > 300 ? `${chosen().slice(0, 300)}…` : chosen()}</pre>
                        <div class="sm-row">
                            <input
                                class="sm-name snp-n"
                                aria-label="Name of the snippet"
                                placeholder="a name, one word"
                                maxLength={NAME_MOST}
                                value={name()}
                                onInput={(event) => setName(event.currentTarget.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') save()
                                }}
                            />
                            <button class="btn go" disabled={!name().trim()} onClick={save}>
                                Save
                            </button>
                        </div>
                    </Show>
                    <Show when={note()}>
                        <p class="sm-note" role="status">
                            {note()}
                        </p>
                    </Show>
                    <h4>Put one in</h4>
                    <div class="sm-list" data-testid="snippets">
                        <For each={allSnippets()}>
                            {(snippet) => (
                                <div class="sm-i">
                                    <button
                                        class="sm-o"
                                        aria-label={`Put in ${snippet.name}`}
                                        title={snippet.code}
                                        onClick={() => {
                                            insertSnippet(snippet.name)
                                            setOpen(false)
                                        }}
                                    >
                                        <b class="snp-b">{snippet.name}</b>
                                        <span class="snp-l">{snippet.pack ? `${snippet.pack}: ${firstLine(snippet.code)}` : firstLine(snippet.code)}</span>
                                    </button>
                                    <Show when={snippet.own} fallback={<span />}>
                                        <button class="rx" aria-label={`Remove the snippet ${snippet.name}`} onClick={() => removeSnippet(snippet.name)}>
                                            <svg viewBox="0 0 8 8">
                                                <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
                                            </svg>
                                        </button>
                                    </Show>
                                </div>
                            )}
                        </For>
                    </div>
                </div>
            </Show>
        </div>
    )
}
