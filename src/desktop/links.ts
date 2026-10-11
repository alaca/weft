// A link on the site that says "Open in Weft" is an address that begins with weft://, which the
// system hands to the desktop app. Only one kind is known: a published song, by its name on the
// site. Anything else in such an address is ignored, so a link can make the app fetch a song
// from the site it publishes to and nothing from anywhere else.
const inDesktop = () => '__TAURI_INTERNALS__' in window

// The song a link asks for, or null when the link is not one of this app's.
export function songOfLink(link: string): string | null {
    return /^weft:\/\/song\/([a-z0-9]{1,16})\/?$/.exec(link.trim())?.[1] ?? null
}

// Tells of every song a link asks for, also the one the app was started with.
export async function onSongLink(open: (id: string) => void): Promise<void> {
    if (!inDesktop()) return
    try {
        const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link')
        const told = (links: string[] | null) => {
            for (const link of links ?? []) {
                const id = songOfLink(link)
                if (id) open(id)
            }
        }
        told(await getCurrent())
        await onOpenUrl(told)
    } catch {
        return
    }
}
