import { batch } from 'solid-js'
import type { Prepared } from '../library/publish'
import { sizeText } from '../library/audio'
import { session, site, SiteRefused, type Refusal } from '../site/api'
import { setAccountNote } from '../stores/account'
import { publishOpen, publishStage, setPublishDone, setPublishFacts, setPublishFrom, setPublishNote, setPublishOpen, setPublishRefused, setPublishStage } from '../stores/publish'
import { refreshAccount, signOutOfSite } from './account'

// Publishing the open song to the site. The song is checked and made to fit here first, so
// that what is wrong with it is said before anything is sent; the site checks it again.
export type PublishDeps = {
    prepare(): Promise<Prepared | null>
    preview(from: number, onProgress: (done: number) => void): Promise<{ mp3: Uint8Array; peaks: number[]; seconds: number } | null>
    busiestBar(): number
    // The published song the open one was downloaded as, when it was.
    cameFrom(): string | null
}
export type PublishForm = { description: string; style: string; licence: string; previewFrom: number }

let deps: PublishDeps

export const attachPublish = (given: PublishDeps) => void (deps = given)

const said = (err: unknown): Refusal => (err instanceof SiteRefused ? err.refusal : { why: 'app', what: String((err as Error)?.message ?? err) })

// Signed out in the middle of something: the window goes back to asking who you are.
async function signedOut(note: string) {
    await signOutOfSite()
    batch(() => {
        setAccountNote(note)
        setPublishNote(null)
        setPublishStage('form')
    })
}

// What stands in the way of this song, said the way the publish window says it.
export function refusalText(refused: Refusal, largest?: { name: string; bytes: number }): string {
    if (refused.why === 'code') return `Line ${refused.line ?? '?'}: ${refused.what}. A song may hold only music code: patterns, sounds and numbers. Take that line out and publish again.`
    if (refused.why === 'size' && largest) return `${refused.what} That is with its sounds as MP3. The largest sound in it is ${largest.name}, at ${sizeText(largest.bytes)}: a shorter take of it would fit.`
    return refused.what
}

async function look() {
    await refreshAccount()
    setPublishStage('form')
    void weigh()
}

// The song as it would be sent, so that the window can say how large it is or what is wrong
// with it before Publish is pressed.
export async function weigh() {
    const made = await deps.prepare().catch(() => null)
    if (!made || !publishOpen()) return
    batch(() => {
        setPublishFacts(made.ok ? { bytes: new TextEncoder().encode(made.text).length, kbps: made.kbps } : null)
        setPublishRefused(made.ok ? null : { ...made.refused, what: refusalText(made.refused, made.largest) })
    })
}

export function openPublish() {
    batch(() => {
        setPublishOpen(true)
        setPublishStage('looking')
        setPublishNote(null)
        setPublishRefused(null)
        setPublishFacts(null)
        setPublishDone(null)
        setPublishFrom(deps.busiestBar())
    })
    void look()
}

export function closePublish() {
    if (publishStage() === 'working') return
    setPublishOpen(false)
}

const base64 = (bytes: Uint8Array): string => {
    let text = ''
    for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
    return btoa(text)
}

export async function publishNow(form: PublishForm) {
    const token = session.get()
    if (!token) return void (await signedOut('Sign in first.'))
    if (publishStage() !== 'form') return
    batch(() => {
        setPublishStage('working')
        setPublishRefused(null)
        setPublishNote('Checking the song.')
    })
    const back = (refused: Refusal | null, note: string | null) =>
        batch(() => {
            setPublishRefused(refused)
            setPublishNote(note)
            setPublishStage('form')
        })
    try {
        const made = await deps.prepare()
        if (!made) return back(null, 'There is no song to publish.')
        if (!made.ok) return back({ ...made.refused, what: refusalText(made.refused, made.largest) }, null)
        setPublishNote('Making the preview, 0%.')
        const preview = await deps.preview(form.previewFrom, (done) => setPublishNote(`Making the preview, ${Math.round(done * 100)}%.`))
        if (!preview) return back(null, 'Nothing sounds in the 30 seconds from that bar, so there is no preview. Choose a bar where the song plays.')
        setPublishNote('Sending the song.')
        const done = await site.publish(token, {
            file: made.text,
            preview: base64(preview.mp3),
            peaks: preview.peaks,
            seconds: preview.seconds,
            description: form.description,
            style: form.style,
            licence: form.licence,
            previewFrom: form.previewFrom,
            ...(deps.cameFrom() ? { from: deps.cameFrom()! } : {}),
        })
        batch(() => {
            setPublishDone(done)
            setPublishNote(null)
            setPublishStage('done')
        })
        void refreshAccount()
    } catch (err) {
        if (err instanceof SiteRefused && err.status === 401) return void (await signedOut('You were signed out. Sign in again to publish.'))
        const refused = said(err)
        if (refused.why === 'code' || refused.why === 'size' || refused.why === 'sound' || refused.why === 'file') return back({ ...refused, what: refusalText(refused) }, null)
        back(null, refused.what)
        if (refused.why === 'full') void refreshAccount()
    }
}
