// A newer version of the app: looking for one, fetching it and starting it. The desktop app
// asks the site, takes only what is signed with the key the app was built to trust, and puts
// itself in place of the old one. In a browser there is nothing to update and nothing happens.
export type NewVersion = {
    version: string
    notes: string
    // Fetches and installs it, saying how far along the fetching is (0 to 1), then starts it.
    install(onProgress: (done: number) => void): Promise<void>
}

const inDesktop = () => '__TAURI_INTERNALS__' in window

// Null when this is the newest version. Throws when the site could not be asked.
export async function lookForUpdate(): Promise<NewVersion | null> {
    if (!inDesktop()) return null
    const { check } = await import('@tauri-apps/plugin-updater')
    const found = await check()
    if (!found) return null
    return {
        version: found.version,
        notes: (found.body ?? '').trim(),
        async install(onProgress) {
            let whole = 0
            let got = 0
            await found.downloadAndInstall((event) => {
                if (event.event === 'Started') whole = event.data.contentLength ?? 0
                else if (event.event === 'Progress') onProgress(whole ? Math.min(1, (got += event.data.chunkLength) / whole) : 0)
                else onProgress(1)
            })
            const { relaunch } = await import('@tauri-apps/plugin-process')
            await relaunch()
        },
    }
}

export async function versionNow(): Promise<string | null> {
    if (!inDesktop()) return null
    const { getVersion } = await import('@tauri-apps/api/app')
    return getVersion()
}
