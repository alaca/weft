import { createEffect, createMemo, createSignal, For, Match, on, onCleanup, onMount, Show, Switch } from 'solid-js'
import { changePassword, closeAccount, deleteAccount, editSong, hideSong, renameYourself, signOutOfSite, takeDown } from '../app/account'
import { sizeText } from '../library/audio'
import { NAME_LIMIT } from '../jam/protocol'
import { LICENCES, PASSWORD_LEAST, type Published } from '../site/api'
import { accountBusy, accountNote, accountOpen, me, mySongs } from '../stores/account'
import { AccountForm } from './AccountForm'

type Part = 'songs' | 'profile' | 'account'
const PARTS: { id: Part; label: string }[] = [
    { id: 'songs', label: 'Songs' },
    { id: 'profile', label: 'Profile' },
    { id: 'account', label: 'Account' },
]
const dayOf = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

// Your account on the site, kept from here: the songs you published, the name beside them,
// and the account itself. The site has no sign-in, so this is the
// only place any of it is changed.
export function AccountDialog() {
    let box: HTMLDivElement | undefined
    const [part, setPart] = createSignal<Part>('songs')
    const [editing, setEditing] = createSignal<string | null>(null)
    const [leaving, setLeaving] = createSignal<string | null>(null)
    const [words, setWords] = createSignal({ description: '', style: '', licence: LICENCES[0].id as string })
    const [name, setName] = createSignal('')
    const [old, setOld] = createSignal('')
    const [next, setNext] = createSignal('')
    const [gone, setGone] = createSignal('')
    const [sure, setSure] = createSignal(false)
    const [copied, setCopied] = createSignal<string | null>(null)

    createEffect(
        on(accountOpen, (open) => {
            if (!open) return
            setPart('songs')
            setEditing(null)
            setLeaving(null)
            setSure(false)
            setOld('')
            setNext('')
            setGone('')
            queueMicrotask(() => box?.focus())
        }),
    )
    createEffect(() => setName(me()?.name ?? ''))
    // Whoever has just signed in is shown their songs, whatever part the window stood on.
    const signedInAs = createMemo(() => me()?.email)
    createEffect(on(signedInAs, () => setPart('songs')))
    const escape = (event: KeyboardEvent) => {
        if (accountOpen() && event.key === 'Escape') closeAccount()
    }
    onMount(() => document.addEventListener('keydown', escape))
    onCleanup(() => document.removeEventListener('keydown', escape))

    const shown = () => mySongs().filter((song) => !song.hidden).length
    const total = (of: 'plays' | 'downloads') => mySongs().reduce((sum, song) => sum + song[of], 0)
    const edit = (song: Published) => {
        setWords({ description: song.description, style: song.style, licence: song.licence })
        setEditing(song.id)
        setLeaving(null)
    }
    const copy = async (song: Published) => {
        try {
            await navigator.clipboard.writeText(song.url)
            setCopied(song.id)
            window.setTimeout(() => setCopied(null), 1600)
        } catch {
            setCopied(null)
        }
    }

    return (
        <Show when={accountOpen()}>
            <div
                class="veil"
                onPointerDown={(event) => {
                    if (event.target === event.currentTarget) closeAccount()
                }}
            >
                <div class="xp ac" role="dialog" aria-modal="true" aria-label="Your account" data-testid="account" tabindex="-1" ref={box}>
                    <div class="xp-h">
                        <h2>Your account</h2>
                        <span class="grow" />
                        <button class="ib" aria-label="Close your account" onClick={closeAccount}>
                            <svg viewBox="0 0 16 16">
                                <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                            </svg>
                        </button>
                    </div>
                    <Show
                        when={me()}
                        fallback={
                            <>
                                <p class="pb-t">An account is for publishing songs on the Weft site. It is an email and a password, and it is made here.</p>
                                <AccountForm />
                            </>
                        }
                    >
                        {(who) => (
                            <>
                                <div class="seg" role="tablist" aria-label="Parts of your account">
                                    <For each={PARTS}>
                                        {(one) => (
                                            <button role="tab" classList={{ on: part() === one.id }} aria-selected={part() === one.id} onClick={() => setPart(one.id)}>
                                                {one.label}
                                            </button>
                                        )}
                                    </For>
                                </div>
                                <Switch>
                                    <Match when={part() === 'songs'}>
                                        <div class="ac-top">
                                            <p class="pb-t" data-testid="account-count">
                                                You have used {who().used} of your {who().most} songs.
                                                <Show when={mySongs().length}>
                                                    {' '}
                                                    {shown()} {shown() === 1 ? 'is' : 'are'} published and {mySongs().length - shown()} hidden. A hidden song counts.
                                                </Show>
                                            </p>
                                            <div class="ac-sum">
                                                <span>
                                                    <b>{total('plays')}</b> plays
                                                </span>
                                                <span>
                                                    <b>{total('downloads')}</b> downloads
                                                </span>
                                            </div>
                                        </div>
                                        <Show when={who().used >= who().most}>
                                            <p class="pb-full" role="status">
                                                <b>All {who().most} are used.</b> Delete a song to make room for a new one.
                                            </p>
                                        </Show>
                                        <Show when={mySongs().length} fallback={<p class="ac-none">Nothing published yet. A song is published with Publish, in the top bar of an open song.</p>}>
                                            <div class="ac-list" data-testid="account-songs">
                                                <For each={mySongs()}>
                                                    {(song) => (
                                                        <div class="ac-i" classList={{ off: song.hidden }}>
                                                            <div class="ac-r">
                                                                <div class="ac-n">
                                                                    <b>{song.name}</b>
                                                                    <span>
                                                                        {song.hidden ? 'Hidden' : 'Published'} {dayOf(song.published)}, {song.plays} plays, {song.downloads} downloads, {sizeText(song.bytes)}
                                                                    </span>
                                                                </div>
                                                                <button class="chip tgl" disabled={accountBusy()} onClick={() => (editing() === song.id ? setEditing(null) : edit(song))}>
                                                                    Edit
                                                                </button>
                                                                <button class="chip tgl" disabled={accountBusy()} title={song.hidden ? 'Put it back on the site' : 'Take it off the site without deleting it'} onClick={() => void hideSong(song.id, !song.hidden)}>
                                                                    {song.hidden ? 'Show' : 'Hide'}
                                                                </button>
                                                                <button class="chip tgl" onClick={() => void copy(song)}>
                                                                    {copied() === song.id ? 'Copied' : 'Copy address'}
                                                                </button>
                                                                <Show
                                                                    when={leaving() === song.id}
                                                                    fallback={
                                                                        <button class="chip tgl" disabled={accountBusy()} onClick={() => setLeaving(song.id)}>
                                                                            Delete
                                                                        </button>
                                                                    }
                                                                >
                                                                    <button
                                                                        class="chip tgl on"
                                                                        disabled={accountBusy()}
                                                                        onClick={() => {
                                                                            setLeaving(null)
                                                                            void takeDown(song.id)
                                                                        }}
                                                                    >
                                                                        Yes, delete {song.name}
                                                                    </button>
                                                                </Show>
                                                            </div>
                                                            <Show when={editing() === song.id}>
                                                                <form
                                                                    class="ac-e"
                                                                    onSubmit={(event) => {
                                                                        event.preventDefault()
                                                                        void editSong(song.id, words()).then((done) => done && setEditing(null))
                                                                    }}
                                                                >
                                                                    <label class="pb-f">
                                                                        <span class="xp-l">Description</span>
                                                                        <textarea rows="3" maxLength={500} aria-label={`Description of ${song.name}`} value={words().description} onInput={(event) => setWords({ ...words(), description: event.currentTarget.value })} />
                                                                    </label>
                                                                    <label class="pb-f">
                                                                        <span class="xp-l">Style</span>
                                                                        <input maxLength={30} aria-label={`Style of ${song.name}`} value={words().style} onInput={(event) => setWords({ ...words(), style: event.currentTarget.value })} />
                                                                    </label>
                                                                    <div class="pb-f" role="radiogroup" aria-label="Licence">
                                                                        <span class="xp-l">Licence</span>
                                                                        <div class="seg">
                                                                            <For each={LICENCES}>
                                                                                {(choice) => (
                                                                                    <button type="button" role="radio" aria-checked={words().licence === choice.id} classList={{ on: words().licence === choice.id }} title={choice.about} onClick={() => setWords({ ...words(), licence: choice.id })}>
                                                                                        {choice.id}
                                                                                    </button>
                                                                                )}
                                                                            </For>
                                                                        </div>
                                                                    </div>
                                                                    <div class="xp-f">
                                                                        <span class="grow" />
                                                                        <button type="button" class="btn" onClick={() => setEditing(null)}>
                                                                            Cancel
                                                                        </button>
                                                                        <button class="btn go" disabled={accountBusy()}>
                                                                            Save
                                                                        </button>
                                                                    </div>
                                                                </form>
                                                            </Show>
                                                        </div>
                                                    )}
                                                </For>
                                            </div>
                                        </Show>
                                    </Match>
                                    <Match when={part() === 'profile'}>
                                        <form
                                            class="pb-acc"
                                            onSubmit={(event) => {
                                                event.preventDefault()
                                                void renameYourself(name())
                                            }}
                                        >
                                            <p class="pb-t">The name that stands beside your songs on the site, and that the other person sees in a jam.</p>
                                            <label class="pb-f">
                                                <span class="xp-l">Name</span>
                                                <input aria-label="Your name" maxLength={NAME_LIMIT} value={name()} onInput={(event) => setName(event.currentTarget.value)} />
                                            </label>
                                            <div class="xp-f">
                                                <span class="grow" />
                                                <button class="btn go" disabled={accountBusy() || name().trim() === who().name}>
                                                    Save
                                                </button>
                                            </div>
                                        </form>
                                    </Match>
                                    <Match when={part() === 'account'}>
                                        <div class="xp-f">
                                            <p class="pb-t">
                                                Signed in as <b>{who().email}</b>. The app stays signed in until you sign out.
                                            </p>
                                            <span class="grow" />
                                            <button class="btn" onClick={() => void signOutOfSite()}>
                                                Sign out
                                            </button>
                                        </div>
                                        <form
                                            class="pb-acc"
                                            onSubmit={(event) => {
                                                event.preventDefault()
                                                void changePassword(old(), next()).then((done) => {
                                                    if (!done) return
                                                    setOld('')
                                                    setNext('')
                                                })
                                            }}
                                        >
                                            <h4 class="pb-h">Change your password</h4>
                                            <label class="pb-f">
                                                <span class="xp-l">Now</span>
                                                <input type="password" aria-label="Your password now" autocomplete="current-password" maxLength={200} value={old()} onInput={(event) => setOld(event.currentTarget.value)} />
                                            </label>
                                            <label class="pb-f">
                                                <span class="xp-l">New</span>
                                                <input type="password" aria-label="Your new password" autocomplete="new-password" placeholder={`At least ${PASSWORD_LEAST} characters`} maxLength={200} value={next()} onInput={(event) => setNext(event.currentTarget.value)} />
                                            </label>
                                            <div class="xp-f">
                                                <span class="grow" />
                                                <button class="btn" disabled={accountBusy() || !old() || !next()}>
                                                    Change it
                                                </button>
                                            </div>
                                        </form>
                                        <form
                                            class="pb-acc"
                                            onSubmit={(event) => {
                                                event.preventDefault()
                                                if (!sure()) return void setSure(true)
                                                void deleteAccount(gone())
                                            }}
                                        >
                                            <h4 class="pb-h">Delete your account</h4>
                                            <p class="ac-none">The account and every song you published are taken off the site. The songs in this app stay.</p>
                                            <label class="pb-f">
                                                <span class="xp-l">Password</span>
                                                <input type="password" aria-label="Your password, to delete the account" autocomplete="current-password" maxLength={200} value={gone()} onInput={(event) => (setGone(event.currentTarget.value), setSure(false))} />
                                            </label>
                                            <div class="xp-f">
                                                <span class="grow" />
                                                <button class="btn" classList={{ on: sure() }} disabled={!gone()}>
                                                    {sure() ? 'Yes, delete my account and its songs' : 'Delete my account'}
                                                </button>
                                            </div>
                                        </form>
                                    </Match>
                                </Switch>
                                <p class="xp-n" role="status" data-testid="account-note">
                                    {accountNote()}
                                </p>
                            </>
                        )}
                    </Show>
                </div>
            </div>
        </Show>
    )
}
