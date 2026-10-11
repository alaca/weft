import { batch } from 'solid-js'
import type { Prepared } from '../library/publish'
import { sizeText } from '../library/audio'
import { session, site, SiteRefused, type Refusal } from '../site/api'
import { jamName } from '../stores/jam'
import { nameYourself } from './jam'
import {
    publishOpen,
    publishStage,
    setPublishDone,
    setPublishFacts,
    setPublishFrom,
    setPublishMail,
    setPublishMe,
    setPublishMine,
    setPublishNote,
    setPublishOpen,
    setPublishRefused,
    setPublishStage,
} from '../stores/publish'

// Publishing the open song to the site. The song is checked and made to fit here first, so
// that what is wrong with it is said before anything is sent; the site checks it again.
export type PublishDeps = {
    prepare(): Promise<Prepared | null>
    preview(from: number, onProgress: (done: number) => void): Promise<Uint8Array | null>
    busiestBar(): number
}
export type PublishForm = { description: string; style: string; licence: string; previewFrom: number }

const POLL_EVERY = 1500
let deps: PublishDeps
let polling = 0

export const attachPublish = (given: PublishDeps) => void (deps = given)

const said = (err: unknown): Refusal => (err instanceof SiteRefused ? err.refusal : { why: 'app', what: String((err as Error)?.message ?? err) })

function signedOut(note: string | null = null) {
    session.clear()
    batch(() => {
        setPublishMe(null)
        setPublishMine([])
        setPublishNote(note)
        setPublishStage('out')
    })
}

// What stands in the way of this song, said the way the publish window says it.
export function refusalText(refused: Refusal, largest?: { name: string; bytes: number }): string {
    if (refused.why === 'code') return `Line ${refused.line ?? '?'}: ${refused.what}. A song may hold only music code: patterns, sounds and numbers. Take that line out and publish again.`
    if (refused.why === 'size' && largest) return `${refused.what} That is with its sounds as MP3. The largest sound in it is ${largest.name}, at ${sizeText(largest.bytes)}: a shorter take of it would fit.`
    return refused.what
}

async function look() {
    const token = session.get()
    if (!token) return signedOut()
    try {
        const [me, mine] = await Promise.all([site.me(token), site.mine(token)])
        batch(() => {
            setPublishMe(me)
            setPublishMine(mine.songs)
            setPublishStage('form')
        })
        void weigh()
    } catch (err) {
        if (err instanceof SiteRefused && err.status === 401) return signedOut()
        batch(() => {
            setPublishNote(said(err).what)
            setPublishStage('out')
        })
    }
}

// The song as it would be sent, so that the window can say how large it is or what is wrong
// with it before Publish is pressed.
async function weigh() {
    const made = await deps.prepare().catch(() => null)
    if (!made || !publishOpen()) return
    batch(() => {
        setPublishFacts(made.ok ? { bytes: new TextEncoder().encode(made.text).length, kbps: made.kbps } : null)
        setPublishRefused(made.ok ? null : { ...made.refused, what: refusalText(made.refused, made.largest) })
    })
}

export function openPublish() {
    window.clearInterval(polling)
    batch(() => {
        setPublishOpen(true)
        setPublishStage('looking')
        setPublishNote(null)
        setPublishRefused(null)
        setPublishFacts(null)
        setPublishDone(null)
        setPublishMail(null)
        setPublishFrom(deps.busiestBar())
    })
    void look()
}

export function closePublish() {
    if (publishStage() === 'working') return
    window.clearInterval(polling)
    setPublishOpen(false)
}

export async function askForLink(address: string, name: string) {
    const email = address.trim()
    if (!name.trim()) return void setPublishNote('Type the name that should stand beside your songs.')
    if (!email) return void setPublishNote('Type the address the link should be sent to.')
    nameYourself(name)
    setPublishNote(null)
    try {
        const asked = await site.askLink(email, jamName())
        batch(() => {
            setPublishMail({ email, link: asked.link ?? null })
            setPublishStage('mail')
        })
        window.clearInterval(polling)
        polling = window.setInterval(async () => {
            const polled = await site.poll(asked.id, asked.secret).catch(() => null)
            if (!polled || polled.state === 'waiting' || !publishOpen()) return
            window.clearInterval(polling)
            if (polled.state === 'gone') return signedOut('The link ran out before it was used. Ask for a new one.')
            session.set(polled.token)
            void look()
        }, POLL_EVERY)
    } catch (err) {
        setPublishNote(said(err).what)
    }
}

export async function signOutOfSite() {
    const token = session.get()
    window.clearInterval(polling)
    if (token) await site.signOut(token).catch(() => undefined)
    signedOut()
}

export async function takeDown(id: string) {
    const token = session.get()
    if (!token) return signedOut()
    try {
        await site.remove(token, id)
        await look()
    } catch (err) {
        setPublishNote(said(err).what)
    }
}

const base64 = (bytes: Uint8Array): string => {
    let text = ''
    for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
    return btoa(text)
}

export async function publishNow(form: PublishForm) {
    const token = session.get()
    if (!token) return signedOut()
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
        const done = await site.publish(token, { file: made.text, preview: base64(preview), description: form.description, style: form.style, licence: form.licence, previewFrom: form.previewFrom })
        batch(() => {
            setPublishDone(done)
            setPublishNote(null)
            setPublishStage('done')
        })
    } catch (err) {
        if (err instanceof SiteRefused && err.status === 401) return signedOut('You were signed out. Sign in again to publish.')
        const refused = said(err)
        if (refused.why === 'code' || refused.why === 'size' || refused.why === 'sound' || refused.why === 'file') return back({ ...refused, what: refusalText(refused) }, null)
        back(null, refused.what)
        if (refused.why === 'full') void look()
    }
}
