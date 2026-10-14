import { createSignal, For, onCleanup, onMount, Show, type JSX } from 'solid-js'
import { Portal } from 'solid-js/web'
import { clipboard, setClipboard } from '../app/clip'
import { clearRow, cutsItself, fillRow, pasteRowAt, previewSound, removeGridRow, replaceRowSound, rotateRow, rowClip, setCut, soundChoices, toggleRowMute } from '../app/controller'
import { rowTarget } from '../song/kit'
import type { PatternBlock } from '../song/types'
import { stale } from '../stores/song'

// What can be done with one sound of a drum grid, from a right click on its name: the way music
// programs offer it, over the whole pattern.
export function RowMenu(props: {
    id: string
    sound: string
    x: number
    y: number
    used: string[]
    block: PatternBlock | undefined
    muted: boolean
    stepped: boolean
    onSteps: () => void
    onClose: () => void
}) {
    let root!: HTMLDivElement
    const [replacing, setReplacing] = createSignal(false)
    const [at, setAt] = createSignal({ left: props.x, top: props.y })
    const away = (event: PointerEvent) => {
        if (!root.contains(event.target as Node)) props.onClose()
    }
    const escape = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        props.onClose()
    }
    // The menu opens where the pointer was, and is moved in when it would run off the window.
    const fit = () =>
        queueMicrotask(() => {
            const box = root.getBoundingClientRect()
            setAt({ left: Math.max(8, Math.min(props.x, window.innerWidth - box.width - 8)), top: Math.max(8, Math.min(props.y, window.innerHeight - box.height - 8)) })
        })
    onMount(() => {
        document.addEventListener('pointerdown', away, true)
        document.addEventListener('keydown', escape, true)
        fit()
    })
    onCleanup(() => {
        document.removeEventListener('pointerdown', away, true)
        document.removeEventListener('keydown', escape, true)
    })

    const done = (act: () => void) => () => {
        act()
        props.onClose()
    }
    const pastable = () => clipboard()?.kind === 'hits'
    const item = (label: string, act: () => void, options: { disabled?: boolean; checked?: boolean; more?: boolean } = {}): JSX.Element => (
        <button role={options.checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={options.checked} disabled={options.disabled || stale()} onClick={act}>
            {label}
            <Show when={options.checked !== undefined}>
                <i class="ck-x" classList={{ on: options.checked }} />
            </Show>
            <Show when={options.more}>
                <svg class="rw-more" viewBox="0 0 10 10" aria-hidden="true">
                    <path d="M3.6 2 6.6 5 3.6 8" />
                </svg>
            </Show>
        </button>
    )

    return (
        <Portal>
            <div class="menu rw" role="menu" aria-label={`What to do with ${props.sound}`} ref={root} style={{ left: `${at().left}px`, top: `${at().top}px` }}>
                <Show
                    when={!replacing()}
                    fallback={
                        <div class="rw-c rw-list">
                            {item('Back', () => {
                                setReplacing(false)
                                fit()
                            })}
                            <hr />
                            <For each={soundChoices(props.id, props.used)}>{(choice) => item(choice.label, done(() => replaceRowSound(props.id, props.sound, choice.sound)))}</For>
                        </div>
                    }
                >
                    <div class="rw-c">
                        {item('Hear', () => previewSound(props.id, props.sound))}
                        {item('Step by step', done(props.onSteps), { checked: props.stepped })}
                        {item('Mute', done(() => toggleRowMute(props.id, props.sound)), { checked: props.muted })}
                        <hr />
                        {item(
                            'Replace with',
                            () => {
                                setReplacing(true)
                                fit()
                            },
                            { more: true },
                        )}
                        {item('Cut itself', done(() => setCut(rowTarget(props.id, props.sound), !(props.block && cutsItself(props.block)))), { checked: Boolean(props.block && cutsItself(props.block)) })}
                        <hr />
                        {item('Remove', done(() => removeGridRow(props.id, props.sound)))}
                    </div>
                    <div class="rw-c">
                        {item(
                            'Cut',
                            done(() => {
                                const clip = rowClip(props.id, props.sound)
                                if (!clip) return
                                setClipboard(clip)
                                clearRow(props.id, props.sound)
                            }),
                        )}
                        {item(
                            'Copy',
                            done(() => {
                                const clip = rowClip(props.id, props.sound)
                                if (clip) setClipboard(clip)
                            }),
                        )}
                        {item(
                            'Paste',
                            done(() => {
                                const clip = clipboard()
                                if (clip) pasteRowAt(props.id, props.sound, clip)
                            }),
                            { disabled: !pastable() },
                        )}
                        <hr />
                        <For each={[2, 4, 8]}>{(every) => item(`Fill each ${every} steps`, done(() => fillRow(props.id, props.sound, every)))}</For>
                        {item('Clear', done(() => clearRow(props.id, props.sound)))}
                        <hr />
                        {item('Rotate left', () => rotateRow(props.id, props.sound, -1))}
                        {item('Rotate right', () => rotateRow(props.id, props.sound, 1))}
                    </div>
                </Show>
            </div>
        </Portal>
    )
}
