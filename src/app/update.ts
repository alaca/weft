import { batch } from 'solid-js'
import { lookForUpdate, versionNow, type NewVersion } from '../desktop/update'
import { setUpdateDone, setUpdateNote, setUpdateNotes, setUpdateStage, setUpdateVersion, updateStage } from '../stores/update'

// Keeping the app up to date. It looks once a little after it starts and says nothing unless
// there is a newer version; asked from the menu, it answers either way. Nothing is fetched or
// changed until Update is pressed, and the song is kept first, because the app starts anew.
export type UpdateDeps = { keep(): void; look?: () => Promise<NewVersion | null> }

let deps: UpdateDeps
let found: NewVersion | null = null
let looking = false

export function attachUpdate(given: UpdateDeps) {
    deps = given
}

// The tests put a version of their own in the place of asking the site.
export function lookWith(look: () => Promise<NewVersion | null>) {
    deps = { ...deps, look }
}

function offer(version: NewVersion) {
    found = version
    batch(() => {
        setUpdateVersion(version.version)
        setUpdateNotes(version.notes)
        setUpdateNote(null)
        setUpdateStage('found')
    })
}

const say = (note: string) =>
    batch(() => {
        setUpdateNote(note)
        setUpdateStage('said')
    })

export async function lookForNewVersion(asked: boolean) {
    if (looking || updateStage() === 'fetching') return
    looking = true
    try {
        const version = await (deps.look ?? lookForUpdate)()
        if (version) return offer(version)
        if (!asked) return
        const mine = await versionNow().catch(() => null)
        say(mine ? `You have the newest Weft Loom, ${mine}.` : 'You have the newest Weft Loom.')
    } catch {
        if (asked) say('The site could not be asked for a newer version. Check that you are online, then choose Check for Updates again.')
    } finally {
        looking = false
    }
}

export async function installNewVersion() {
    if (!found || updateStage() === 'fetching') return
    let version: NewVersion = found
    deps.keep()
    batch(() => {
        setUpdateDone(0)
        setUpdateNote(null)
        setUpdateStage('fetching')
    })
    try {
        // An app left open may have found its version a day ago. What is newest now is fetched.
        const newest = await (deps.look ?? lookForUpdate)().catch(() => null)
        if (newest) {
            version = found = newest
            setUpdateVersion(newest.version)
        }
        await version.install(setUpdateDone)
    } catch (err) {
        batch(() => {
            setUpdateNote(`Weft Loom ${version.version} could not be put in place: ${String((err as Error)?.message ?? err)}. The Weft Loom you have is as it was. Press Try again, or leave it for later.`)
            setUpdateStage('failed')
        })
    }
}

// Not now. It is offered again the next time the app starts, or when it is asked for.
export const putUpdateOff = () => setUpdateStage('none')
