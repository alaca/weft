// Choosing a file from the desktop app's own menu. A menu is not a click in the window, and a
// window may only open its file chooser from a click, so the system's window is asked for
// instead. Null when nothing was chosen or this is not the desktop app.
const inDesktop = () => '__TAURI_INTERNALS__' in window

export async function chooseFile(label: string, extensions: string[]): Promise<File | null> {
    if (!inDesktop()) return null
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { readFile } = await import('@tauri-apps/plugin-fs')
    const path = await open({ multiple: false, directory: false, filters: [{ name: label, extensions }] })
    if (typeof path !== 'string') return null
    const bytes = await readFile(path)
    return new File([bytes as BlobPart], path.split(/[\\/]/).pop() || 'song')
}
