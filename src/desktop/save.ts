// Saving a file to disk. In the desktop app the system's own window asks where it should go.
// A browser has no such window to offer, so there the file goes to the downloads folder.
// `where` is the place that was chosen, when there is one to tell.
export type Saved = { saved: true; where: string | null } | { saved: false }
export type FileKind = { extension: string; label: string; type: string }

const inDesktop = () => '__TAURI_INTERNALS__' in window

async function askWhere(name: string, kind: FileKind): Promise<string | null> {
    const { save } = await import('@tauri-apps/plugin-dialog')
    return save({ defaultPath: name, filters: [{ name: kind.label, extensions: [kind.extension] }] })
}

function download(name: string, parts: BlobPart[], kind: FileKind): Saved {
    const url = URL.createObjectURL(new Blob(parts, { type: kind.type }))
    const link = document.createElement('a')
    link.href = url
    link.download = name
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return { saved: true, where: null }
}

export async function saveFile(name: string, data: Uint8Array | string, kind: FileKind): Promise<Saved> {
    if (!inDesktop()) return download(name, [data as BlobPart], kind)
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const path = await askWhere(name, kind)
    if (!path) return { saved: false }
    await writeFile(path, typeof data === 'string' ? new TextEncoder().encode(data) : data)
    return { saved: true, where: path }
}

// A file too big to hold in one piece, written as its pieces are made. In the desktop app the
// place is asked for first and every piece goes straight to disk. A browser can only hand over
// a finished file, so there the pieces are kept until the last one. Nothing is given back when
// no place was chosen.
export type Pieces = { write(piece: Uint8Array): Promise<void>; done(): Promise<Saved> }

const PIECE = 1 << 20

// A long text as pieces to write one after another, each made when it is asked for. A piece
// never ends between the two halves of a character that is written as two: each half alone
// would be written as a sign that means nothing.
export function* textPieces(text: string, size = PIECE): Generator<Uint8Array> {
    const encoder = new TextEncoder()
    for (let at = 0; at < text.length; ) {
        let to = Math.min(text.length, at + size)
        if (to < text.length && (text.charCodeAt(to) & 0xfc00) === 0xdc00) to++
        yield encoder.encode(text.slice(at, to))
        at = to
    }
}

export async function savePieces(name: string, kind: FileKind): Promise<Pieces | null> {
    if (!inDesktop()) {
        const kept: BlobPart[] = []
        return {
            async write(piece) {
                kept.push(piece as BlobPart)
            },
            done: async () => download(name, kept, kind),
        }
    }
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const path = await askWhere(name, kind)
    if (!path) return null
    let begun = false
    return {
        async write(piece) {
            await writeFile(path, piece, begun ? { append: true } : undefined)
            begun = true
        },
        done: async () => ({ saved: true, where: path }),
    }
}
