import { createEffect, createSignal, For, Match, on, onCleanup, onMount, Show, Switch } from 'solid-js'
import { songLengthNow } from '../app/controller'
import { askForLink, closePublish, publishNow, signOutOfSite, takeDown } from '../app/publish'
import { sizeText } from '../library/audio'
import { NAME_LIMIT } from '../jam/protocol'
import { LICENCES } from '../site/api'
import { jamName } from '../stores/jam'
import { publishDone, publishFacts, publishFrom, publishMail, publishMe, publishMine, publishNote, publishOpen, publishRefused, publishStage, setPublishFrom } from '../stores/publish'
import { currentSong } from '../stores/song'

// Publishing the open song to the site: signing in with a link sent to an address, then what
// the song's page should say, and what stands in the way when something does.
export function PublishDialog() {
    let box: HTMLDivElement | undefined
    const [email, setEmail] = createSignal('')
    const [name, setName] = createSignal('')
    const [description, setDescription] = createSignal('')
    const [style, setStyle] = createSignal('')
    const [licence, setLicence] = createSignal<string>(LICENCES[0].id)
    const [copied, setCopied] = createSignal(false)
    const [leaving, setLeaving] = createSignal<string | null>(null)
    const busy = () => publishStage() === 'working'
    const full = () => (publishMe() ? publishMe()!.used >= publishMe()!.most : false)

    createEffect(
        on(publishOpen, (open) => {
            if (!open) return
            setLeaving(null)
            setName(jamName())
            queueMicrotask(() => box?.focus())
        }),
    )
    const escape = (event: KeyboardEvent) => {
        if (publishOpen() && event.key === 'Escape') closePublish()
    }
    onMount(() => document.addEventListener('keydown', escape))
    onCleanup(() => document.removeEventListener('keydown', escape))

    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1600)
        } catch {
            setCopied(false)
        }
    }
    const step = (by: number) => setPublishFrom(Math.max(0, Math.min(songLengthNow() - 1, publishFrom() + by)))

    return (
        <Show when={publishOpen()}>
            <div
                class="veil"
                onPointerDown={(event) => {
                    if (event.target === event.currentTarget) closePublish()
                }}
            >
                <div class="xp pb" role="dialog" aria-modal="true" aria-label={`Publish ${currentSong()?.name ?? ''}`} data-testid="publish" tabindex="-1" ref={box}>
                    <div class="xp-h">
                        <h2>
                            Publish <b>{currentSong()?.name}</b>
                        </h2>
                        <span class="grow" />
                        <button class="ib" aria-label="Close publish" disabled={busy()} onClick={closePublish}>
                            <svg viewBox="0 0 16 16">
                                <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                            </svg>
                        </button>
                    </div>
                    <Switch>
                        <Match when={publishStage() === 'looking'}>
                            <p class="xp-n">Asking the site who you are.</p>
                        </Match>
                        <Match when={publishStage() === 'out'}>
                            <p class="pb-t">Publishing puts this song on the Weft site, where others can hear half a minute of it and download it to work on. You sign in with a link sent to your address; there is no password.</p>
                            <form
                                class="pb-row"
                                onSubmit={(event) => {
                                    event.preventDefault()
                                    void askForLink(email(), name())
                                }}
                            >
                                <input class="pb-name" placeholder="Your name" aria-label="Your name, as it stands beside your songs" value={name()} maxLength={NAME_LIMIT} onInput={(event) => setName(event.currentTarget.value)} />
                                <input type="email" placeholder="you@example.com" aria-label="Your address" value={email()} maxLength={254} onInput={(event) => setEmail(event.currentTarget.value)} />
                                <button class="btn go">Send me a link</button>
                            </form>
                        </Match>
                        <Match when={publishStage() === 'mail' ? publishMail() : null}>
                            {(mail) => (
                                <>
                                    <p class="pb-t">
                                        A link is on its way to <b>{mail().email}</b>. Open it, press Sign in on the page it shows, and come back here. This window goes on by itself.
                                    </p>
                                    <Show when={mail().link}>
                                        {(link) => (
                                            <div class="pb-dev">
                                                <p>No mail is sent from this machine, so here is the link itself.</p>
                                                <div class="pb-row">
                                                    <a class="btn" href={link()} target="_blank" rel="noreferrer" data-testid="publish-link">
                                                        Open the sign-in page
                                                    </a>
                                                    <button class="btn" onClick={() => void copy(link())}>
                                                        {copied() ? 'Copied' : 'Copy the link'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </Show>
                                </>
                            )}
                        </Match>
                        <Match when={publishStage() === 'done' ? publishDone() : null}>
                            {(done) => (
                                <>
                                    <p class="pb-t" role="status">
                                        <b>{done().name}</b> is published. Its page is at <span class="pb-url">{done().url}</span>
                                    </p>
                                    <div class="xp-f">
                                        <button class="btn" onClick={() => void copy(done().url)}>
                                            {copied() ? 'Copied' : 'Copy the address'}
                                        </button>
                                        <a class="btn" href={done().url} target="_blank" rel="noreferrer">
                                            Open the page
                                        </a>
                                        <span class="grow" />
                                        <button class="btn go" onClick={closePublish}>
                                            Close
                                        </button>
                                    </div>
                                </>
                            )}
                        </Match>
                        <Match when={publishMe()}>
                            {(me) => (
                                <>
                                    <p class="pb-t" data-testid="publish-count">
                                        You have used {me().used} of your {me().most} songs.
                                    </p>
                                    <Show
                                        when={!full()}
                                        fallback={
                                            <p class="pb-full" role="status">
                                                <b>All {me().most} are used.</b> Take one down below to make room for this one.
                                            </p>
                                        }
                                    >
                                        <label class="pb-f">
                                            <span class="xp-l">Description</span>
                                            <textarea rows="3" maxLength={500} placeholder="What people read on the song's page" value={description()} disabled={busy()} onInput={(event) => setDescription(event.currentTarget.value)} />
                                        </label>
                                        <label class="pb-f">
                                            <span class="xp-l">Style</span>
                                            <input maxLength={30} placeholder="One tag, in your own words" value={style()} disabled={busy()} onInput={(event) => setStyle(event.currentTarget.value)} />
                                        </label>
                                        <div class="pb-f" role="radiogroup" aria-label="Licence">
                                            <span class="xp-l">Licence</span>
                                            <div class="pb-lic">
                                                <For each={LICENCES}>
                                                    {(choice) => (
                                                        <button role="radio" aria-checked={licence() === choice.id} classList={{ on: licence() === choice.id }} disabled={busy()} onClick={() => setLicence(choice.id)}>
                                                            <b>{choice.id}</b>
                                                            <span>{choice.about}</span>
                                                        </button>
                                                    )}
                                                </For>
                                            </div>
                                        </div>
                                        <div class="pb-f">
                                            <span class="xp-l">Preview</span>
                                            <div class="pb-prev">
                                                <span>The 30 seconds people hear start at bar</span>
                                                <button class="ib" aria-label="An earlier bar" disabled={busy() || publishFrom() <= 0} onClick={() => step(-1)}>
                                                    <svg viewBox="0 0 16 16">
                                                        <path d="M4 8h8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                                                    </svg>
                                                </button>
                                                <b data-testid="publish-from">{publishFrom() + 1}</b>
                                                <button class="ib" aria-label="A later bar" disabled={busy() || publishFrom() >= songLengthNow() - 1} onClick={() => step(1)}>
                                                    <svg viewBox="0 0 16 16">
                                                        <path d="M4 8h8M8 4v8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                        <Show when={publishRefused()}>
                                            {(refused) => (
                                                <div class="pb-no" role="alert" data-testid="publish-refused">
                                                    <b>This song cannot be published</b>
                                                    <p>{refused().what}</p>
                                                </div>
                                            )}
                                        </Show>
                                        <p class="xp-n" role="status" data-testid="publish-note">
                                            <Show when={publishNote()} fallback={<Show when={publishFacts()}>{(facts) => <>The song file is {sizeText(facts().bytes)}{facts().kbps === null ? '.' : `, with your sounds as MP3 at ${facts().kbps} kbps so that it fits.`}</>}</Show>}>
                                                {publishNote()}
                                            </Show>
                                        </p>
                                        <div class="xp-f">
                                            <span class="pb-own">By publishing you say the song and its sounds are yours to share.</span>
                                            <span class="grow" />
                                            <button class="btn" disabled={busy()} onClick={closePublish}>
                                                Close
                                            </button>
                                            <button class="btn go" disabled={busy() || Boolean(publishRefused())} onClick={() => void publishNow({ description: description(), style: style(), licence: licence(), previewFrom: publishFrom() })}>
                                                Publish
                                            </button>
                                        </div>
                                    </Show>
                                    <Show when={publishMine().length}>
                                        <h4 class="pb-h">On the site</h4>
                                        <div class="pb-list" data-testid="publish-mine">
                                            <For each={publishMine()}>
                                                {(song) => (
                                                    <div class="pb-i">
                                                        <b>{song.name}</b>
                                                        <span>{song.hidden ? 'hidden' : 'published'}</span>
                                                        <Show
                                                            when={leaving() === song.id}
                                                            fallback={
                                                                <button class="chip tgl" disabled={busy()} onClick={() => setLeaving(song.id)}>
                                                                    Take down
                                                                </button>
                                                            }
                                                        >
                                                            <button
                                                                class="chip tgl on"
                                                                disabled={busy()}
                                                                onClick={() => {
                                                                    setLeaving(null)
                                                                    void takeDown(song.id)
                                                                }}
                                                            >
                                                                Yes, take {song.name} down
                                                            </button>
                                                        </Show>
                                                    </div>
                                                )}
                                            </For>
                                        </div>
                                    </Show>
                                    <p class="pb-who">
                                        Signed in as {me().email}.{' '}
                                        <button disabled={busy()} onClick={() => void signOutOfSite()}>
                                            Sign out
                                        </button>
                                    </p>
                                </>
                            )}
                        </Match>
                    </Switch>
                    <Show when={publishStage() === 'out' || publishStage() === 'mail'}>
                        <p class="xp-n" role="status" data-testid="publish-note">
                            {publishNote()}
                        </p>
                    </Show>
                </div>
            </div>
        </Show>
    )
}
