// Opens a page in the person's own browser. The desktop window may only open pages of the
// site (its permissions name them), so nothing a song holds can send anyone anywhere else.
const inDesktop = () => '__TAURI_INTERNALS__' in window

export async function openInBrowser(url: string): Promise<void> {
    if (!inDesktop()) return void window.open(url, '_blank', 'noopener')
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url).catch(() => undefined)
}
