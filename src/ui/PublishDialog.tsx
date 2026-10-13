import { createEffect, createMemo, createSignal, For, Match, on, onCleanup, onMount, Show, Switch } from 'solid-js'
import { openAccount } from '../app/account'
import { songLengthNow } from '../app/controller'
import { closePublish, publishNow, weigh } from '../app/publish'
import { sizeText } from '../library/audio'
import { LICENCES } from '../site/api'
import { me } from '../stores/account'
import { publishDone, publishFacts, publishFrom, publishNote, publishOpen, publishRefused, publishStage, setPublishFrom } from '../stores/publish'
import { currentSong } from '../stores/song'
import { AccountForm } from './AccountForm'

// Publishing the open song to the site: an account made or signed in to here, then what the
// song's page should say, and what stands in the way when something does.
export function PublishDialog() {
    let box: HTMLDivElement | undefined
    const [description, setDescription] = createSignal('')
    const [style, setStyle] = createSignal('')
    const [licence, setLicence] = createSignal<string>(LICENCES[0].id)
    const [copied, setCopied] = createSignal(false)
    const busy = () => publishStage() === 'working'
    const full = () => (me() ? me()!.used >= me()!.most : false)

    createEffect(
        on(publishOpen, (open) => {
            if (open) queueMicrotask(() => box?.focus())
        }),
    )
    // Signing in from inside this window: once it is known who is publishing, the song is
    // looked at, so that the window can say how large it is or what is wrong with it.
    const signedInAs = createMemo(() => me()?.email)
    createEffect(
        on(signedInAs, (email) => {
            if (email && publishOpen() && publishStage() === 'form') void weigh()
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
                        <Match when={me()}>
                            {(who) => (
                                <>
                                    <p class="pb-t" data-testid="publish-count">
                                        You have used {who().used} of your {who().most} songs.
                                    </p>
                                    <Show
                                        when={!full()}
                                        fallback={
                                            <p class="pb-full" role="status">
                                                <b>All {who().most} are used.</b> Delete one in your account to make room for this one.
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
                                    <p class="pb-who">
                                        Signed in as {who().email}.{' '}
                                        <button
                                            disabled={busy()}
                                            onClick={() => {
                                                closePublish()
                                                openAccount()
                                            }}
                                        >
                                            Your account and your songs
                                        </button>
                                    </p>
                                </>
                            )}
                        </Match>
                        <Match when={true}>
                            <p class="pb-t">Publishing puts this song on the Weft Loom site, where others can hear half a minute of it and download it to work on. It needs an account: your email and a password. You make it here, once, and the app stays signed in.</p>
                            <AccountForm />
                        </Match>
                    </Switch>
                </div>
            </div>
        </Show>
    )
}
