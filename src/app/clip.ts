import { createSignal } from 'solid-js'
import type { Clip } from '../song/clip'

// What was copied last, from a roll or a drum grid, for as long as the app is open. It can be
// pasted into the same pattern or into another of the same kind.
export const [clipboard, setClipboard] = createSignal<Clip | null>(null)

// A roll or a grid that can have notes or hits chosen in it. Each answers whether it did
// anything, so that a key it has no use for goes on to whatever else wants it.
export type Editor = {
    selectAll(): boolean
    copy(): boolean
    cut(): boolean
    paste(): boolean
    remove(): boolean
    clear(): boolean
}

const editors = new Map<string, Editor>()

// The keys act on the pattern last pressed in, not on what has the keyboard: in a Mac's window a
// click does not give a button the keyboard, so after a click on a page of a roll, or on a
// knob, the keys would go nowhere.
export const [editingIn, setEditingIn] = createSignal<string | null>(null)

export function registerEditor(id: string, editor: Editor): () => void {
    editors.set(id, editor)
    return () => {
        if (editors.get(id) === editor) editors.delete(id)
    }
}

// The strip a press lands in becomes the one the keys act on.
export function watchPresses(): () => void {
    const pressed = (event: PointerEvent) => {
        const strip = (event.target as HTMLElement | null)?.closest?.<HTMLElement>('section.st[data-testid^="strip-"]')
        if (strip) setEditingIn(strip.dataset.testid!.slice('strip-'.length))
    }
    document.addEventListener('pointerdown', pressed, true)
    return () => document.removeEventListener('pointerdown', pressed, true)
}

const typing = (event: KeyboardEvent) => Boolean((event.target as HTMLElement | null)?.closest?.('.cm-editor, input, textarea, select, [role="dialog"], [contenteditable]'))

// Cmd C, X and V copy, cut and paste what is chosen, Cmd A chooses everything, Delete takes it
// out and Escape lets it go. True when the key was used.
export function editKey(event: KeyboardEvent): boolean {
    if (event.defaultPrevented || typing(event) || event.altKey) return false
    const id = editingIn()
    const editor = id ? editors.get(id) : undefined
    if (!editor) return false
    const command = event.metaKey || event.ctrlKey
    const letter = event.key.toLowerCase()
    if (command && !event.shiftKey) {
        if (letter === 'a') return editor.selectAll()
        if (letter === 'c') return editor.copy()
        if (letter === 'x') return editor.cut()
        if (letter === 'v') return editor.paste()
        return false
    }
    if (command || event.shiftKey) return false
    if (event.key === 'Delete' || event.key === 'Backspace') return editor.remove()
    if (event.key === 'Escape') return editor.clear()
    return false
}
