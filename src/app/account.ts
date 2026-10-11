import { batch } from 'solid-js'
import { account, PASSWORD_LEAST, session, site, SiteRefused, type Signed, type SongWords } from '../site/api'
import { accountBusy, forgotFor, me, setAccountBusy, setAccountNote, setAccountOpen, setForgotFor, setMe, setMySongs } from '../stores/account'
import { nameYourself } from './jam'

// Your account on the site, kept from inside the app: making it, signing in and out, your
// published songs, your name, what you chose for jams, your password. The site has no sign-in
// of its own, so everything that is yours to change is changed here.
const said = (err: unknown): string => (err instanceof SiteRefused ? err.refusal.what : String((err as Error)?.message ?? err))

function signedOut(note: string | null = null) {
    session.clear()
    batch(() => {
        setMe(null)
        setMySongs([])
        setAccountNote(note)
    })
}

// Asks the site who is signed in and what they have published. False when nobody is.
export async function refreshAccount(): Promise<boolean> {
    const token = session.get()
    if (!token) {
        if (me()) signedOut()
        return false
    }
    try {
        const [who, mine] = await Promise.all([site.me(token), site.mine(token)])
        batch(() => {
            setMe(who)
            setMySongs(mine.songs)
        })
        return true
    } catch (err) {
        if (err instanceof SiteRefused && err.status === 401) signedOut()
        else setAccountNote(said(err))
        return false
    }
}

// Does something that needs the person signed in, says so when it fails, and looks again at
// the account afterwards so that what is shown is what the site has.
async function withToken(work: (token: string) => Promise<unknown>, done: string | null = null): Promise<boolean> {
    const token = session.get()
    if (!token) return signedOut('Sign in first.'), false
    if (accountBusy()) return false
    setAccountBusy(true)
    setAccountNote(null)
    try {
        await work(token)
        await refreshAccount()
        setAccountNote(done)
        return true
    } catch (err) {
        if (err instanceof SiteRefused && err.status === 401 && err.refusal.why !== 'wrong') signedOut('You were signed out. Sign in again.')
        else setAccountNote(said(err))
        return false
    } finally {
        setAccountBusy(false)
    }
}

async function signedIn(signed: Signed) {
    session.set(signed.token)
    account.set(signed.email)
    setForgotFor(null)
    nameYourself(signed.name)
    await refreshAccount()
}

const shortPassword = (password: string) => password.length < PASSWORD_LEAST

export async function makeAccount(name: string, address: string, password: string) {
    if (!name.trim()) return void setAccountNote('Type the name that should stand beside your songs.')
    if (!address.trim()) return void setAccountNote('Type your email.')
    if (shortPassword(password)) return void setAccountNote(`A password needs at least ${PASSWORD_LEAST} characters.`)
    setAccountNote(null)
    try {
        await signedIn(await site.register(address.trim(), password, name.trim()))
    } catch (err) {
        setAccountNote(said(err))
    }
}

export async function signInToSite(address: string, password: string) {
    if (!address.trim() || !password) return void setAccountNote('Type your email and your password.')
    setAccountNote(null)
    try {
        await signedIn(await site.signIn(address.trim(), password))
    } catch (err) {
        setAccountNote(said(err))
    }
}

export async function signOutOfSite() {
    const token = session.get()
    if (token) await site.signOut(token).catch(() => undefined)
    signedOut()
}

// A forgotten password is replaced with a code that is sent to the address and typed in here.
export async function forgotPassword(address: string) {
    const email = address.trim()
    if (!email) return void setAccountNote('Type your email first, then press this again.')
    try {
        const asked = await site.forgot(email)
        batch(() => {
            setForgotFor({ email, code: asked.code ?? null })
            setAccountNote('If there is an account with that email, a code is on its way to it. Type the code and a new password.')
        })
    } catch (err) {
        setAccountNote(said(err))
    }
}

export async function resetPassword(code: string, password: string) {
    const asked = forgotFor()
    if (!asked) return
    if (!code.trim()) return void setAccountNote('Type the code that was sent to you.')
    if (shortPassword(password)) return void setAccountNote(`A password needs at least ${PASSWORD_LEAST} characters.`)
    setAccountNote(null)
    try {
        await signedIn(await site.reset(asked.email, code.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''), password))
    } catch (err) {
        setAccountNote(said(err))
    }
}

export const backToSignIn = () =>
    batch(() => {
        setForgotFor(null)
        setAccountNote(null)
    })

export async function renameYourself(name: string) {
    if (!name.trim()) return void setAccountNote('Type the name that should stand beside your songs.')
    if (await withToken((token) => site.rename(token, name.trim()), 'Your name is changed.')) nameYourself(name.trim())
}

export const setOpenToJam = (open: boolean) => withToken((token) => site.jams(token, { open }))
export const unblock = (id: string) => withToken((token) => site.jams(token, { unblock: id }))

export async function changePassword(old: string, next: string): Promise<boolean> {
    if (shortPassword(next)) return setAccountNote(`A password needs at least ${PASSWORD_LEAST} characters.`), false
    return withToken((token) => site.password(token, old, next), 'Your password is changed.')
}

export async function deleteAccount(password: string) {
    const token = session.get()
    if (!token) return signedOut()
    if (!password) return void setAccountNote('Type your password to delete the account.')
    try {
        await site.removeAccount(token, password)
        signedOut('Your account and its songs are deleted.')
    } catch (err) {
        setAccountNote(said(err))
    }
}

export const editSong = (id: string, words: SongWords) => withToken((token) => site.edit(token, id, words), 'The song is changed.')
export const hideSong = (id: string, hidden: boolean) => withToken((token) => site.hide(token, id, hidden))
export const takeDown = (id: string) => withToken((token) => site.remove(token, id))

export function openAccount() {
    batch(() => {
        setAccountNote(null)
        setForgotFor(null)
        setAccountOpen(true)
    })
    void refreshAccount()
}

export const closeAccount = () => setAccountOpen(false)
