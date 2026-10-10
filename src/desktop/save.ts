// Saving a file to disk. In the desktop app the system's own window asks where it should go.
// A browser has no such window to offer, so there the file goes to the downloads folder.
// `where` is the place that was chosen, when there is one to tell.
export type Saved = { saved: true; where: string | null } | { saved: false }
export type FileKind = { extension: string; label: string; type: string }

const inDesktop = () => '__TAURI_INTERNALS__' in window

export async function saveFile(name: string, data: Uint8Array | string, kind: FileKind): Promise<Saved> {
    if (inDesktop()) {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeFile } = await import('@tauri-apps/plugin-fs')
        const path = await save({ defaultPath: name, filters: [{ name: kind.label, extensions: [kind.extension] }] })
        if (!path) return { saved: false }
        await writeFile(path, typeof data === 'string' ? new TextEncoder().encode(data) : data)
        return { saved: true, where: path }
    }
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: kind.type }))
    const link = document.createElement('a')
    link.href = url
    link.download = name
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return { saved: true, where: null }
}
