import { batch } from 'solid-js'
import { lookForUpdate, versionNow, type NewVersion } from '../desktop/update'
import { setUpdateDone, setUpdateNote, setUpdateNotes, setUpdateStage, setUpdateVersion, updateStage } from '../stores/update'

// Keeping the app up to date. It looks a little after it starts, and again every few hours while
// it stays open, and says nothing unless there is a newer version; asked from the menu, it answers
// either way. Nothing is fetched or changed until Update is pressed, and the song is kept first,
// because the app starts anew.
export type UpdateDeps = { keep(): void; look?: () => Promise<NewVersion | null> }

let deps: UpdateDeps
let found: NewVersion | null = null
let looking = false
let lookedAt = 0
// The version Later was pressed on. The app does not bring it back by itself until it starts again.
let putOff: string | null = null

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
    lookedAt = Date.now()
    try {
        const version = await (deps.look ?? lookForUpdate)()
        if (version && (asked || version.version !== putOff)) return offer(version)
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
export function putUpdateOff() {
    if (updateStage() === 'found' || updateStage() === 'failed') putOff = found?.version ?? null
    setUpdateStage('none')
}

// An app left open for days still hears of a version that came out meanwhile. It looks again
// when the last look is a few hours old, and only while nothing plays and no jam is on, so that
// the card never comes up in the middle of a set. Gives back what stops it.
const LOOK_AGAIN_AFTER = 6 * 60 * 60 * 1000
const SEE_WHETHER_DUE = 10 * 60 * 1000

export function lookNowAndThen(busy: () => boolean): () => void {
    const timer = setInterval(() => {
        const stage = updateStage()
        if (busy() || Date.now() - lookedAt < LOOK_AGAIN_AFTER || (stage !== 'none' && stage !== 'found')) return
        void lookForNewVersion(false)
    }, SEE_WHETHER_DUE)
    return () => clearInterval(timer)
}
