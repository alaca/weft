import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from 'solid-js'
import { openAccount, refreshAccount, signOutOfSite } from '../app/account'
import { goOn, newSong, openFromSite, openSong, openSongFile, recentSongs } from '../app/controller'
import { whenText } from '../library/shelf'
import { site, type SiteSong } from '../site/api'
import { me } from '../stores/account'
import { currentSong, songNote, songs, startOpen } from '../stores/song'
import { AccountForm } from './AccountForm'

type Order = 'new' | 'most'
const ORDERS: { id: Order; label: string }[] = [
    { id: 'new', label: 'Newest' },
    { id: 'most', label: 'Most downloaded' },
]
const WHO = ['var(--linen-2)', 'var(--woad)', 'var(--orchil)', 'var(--saffron)', 'var(--lichen)', 'var(--madder)']
const colourOf = (name: string) => WHO[[...name].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % WHO.length]
const letter = (name: string) => name.trim().charAt(0).toUpperCase() || '?'
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

// What the app opens with, and what closing a song goes back to: your songs, the songs on the
// site, and your account, on one screen. Choosing a song leaves it.
export function StartScreen() {
    let picker: HTMLInputElement | undefined
    const player = new Audio()
    const [found, setFound] = createSignal<SiteSong[]>([])
    const [reached, setReached] = createSignal<'asking' | 'yes' | 'no'>('asking')
    const [query, setQuery] = createSignal('')
    const [order, setOrder] = createSignal<Order>('new')
    const [playing, setPlaying] = createSignal<string | null>(null)
    const [heard, setHeard] = createSignal({ at: 0, of: 30 })
    const [opening, setOpening] = createSignal<string | null>(null)
    const [now, setNow] = createSignal(Date.now())

    const recent = createMemo(() => (startOpen() && songs() ? recentSongs() : []))
    const listed = createMemo(() => {
        const wanted = query().trim().toLowerCase()
        const fits = found().filter((song) => !wanted || [song.name, song.by, song.style].some((text) => text.toLowerCase().includes(wanted)))
        return order() === 'most' ? [...fits].sort((a, b) => b.downloads - a.downloads || b.published - a.published) : fits
    })

    const ask = async () => {
        setReached('asking')
        try {
            setFound((await site.songs()).songs)
            setReached('yes')
        } catch {
            setReached('no')
        }
    }
    const quiet = () => {
        player.pause()
        setPlaying(null)
    }
    const hear = (song: SiteSong) => {
        if (playing() === song.id) return quiet()
        player.src = song.preview
        setHeard({ at: 0, of: song.seconds ?? 30 })
        setPlaying(song.id)
        void player.play().catch(quiet)
    }
    player.addEventListener('timeupdate', () => setHeard((was) => ({ at: player.currentTime, of: Number.isFinite(player.duration) ? player.duration : was.of })))
    player.addEventListener('ended', quiet)

    createEffect(
        on(startOpen, (open) => {
            if (!open) return quiet()
            setNow(Date.now())
            void ask()
            void refreshAccount()
        }),
    )
    onCleanup(() => player.pause())

    const copyOf = async (song: SiteSong) => {
        if (opening()) return
        setOpening(song.id)
        await openFromSite(song.id)
        setOpening(null)
    }

    return (
        <Show when={startOpen()}>
            <div class="sx" data-testid="start">
                <header class="sx-top">
                    <div class="word">Weft</div>
                    <span class="sx-what">Drum grids, piano rolls and knobs beside the code. Both show the same song.</span>
                </header>

                <section class="sx-mine" aria-label="Your songs">
                    <div class="sx-h">
                        <h2>Your songs</h2>
                    </div>
                    <div class="sx-acts">
                        <Show
                            when={currentSong()}
                            fallback={
                                <button class="btn go" onClick={newSong}>
                                    <svg viewBox="0 0 16 16">
                                        <path d="M8 3v10M3 8h10" />
                                    </svg>
                                    New song
                                </button>
                            }
                        >
                            {(song) => (
                                <>
                                    <button class="btn go" data-testid="start-go-on" onClick={goOn}>
                                        Go on with <b>{song().name}</b>
                                        <svg class="end" viewBox="0 0 16 16">
                                            <path d="M3 8h10M9 4l4 4-4 4" />
                                        </svg>
                                    </button>
                                    <button class="btn" onClick={newSong}>
                                        <svg viewBox="0 0 16 16">
                                            <path d="M8 3v10M3 8h10" />
                                        </svg>
                                        New song
                                    </button>
                                </>
                            )}
                        </Show>
                        <button class="btn" onClick={() => picker?.click()}>
                            <svg viewBox="0 0 16 16">
                                <path d="M2 4.5h4l1.5 1.5H14v6.5H2z" />
                            </svg>
                            Open a file
                        </button>
                        <input
                            ref={picker}
                            type="file"
                            accept=".weft,.js,.strudel,.txt"
                            hidden
                            data-testid="start-file"
                            onChange={(event) => {
                                const file = event.currentTarget.files?.[0]
                                event.currentTarget.value = ''
                                if (file) void openSongFile(file)
                            }}
                        />
                    </div>
                    <Show
                        when={recent().length}
                        fallback={
                            <div class="sx-none" data-testid="start-none">
                                <b>You have no songs yet.</b>
                                Press New song to start one. Or open a copy of a song from the site, on the right, and see how it is made.
                            </div>
                        }
                    >
                        <div class="sx-rec">
                            <span class="cap">Recent</span>
                            <ul data-testid="start-recent">
                                <For each={recent()}>
                                    {(song) => (
                                        <li>
                                            <button class="sx-ri" aria-label={`Open ${song.name}`} onClick={() => (song.id === currentSong()?.id ? goOn() : openSong(song.id))}>
                                                <span>
                                                    <span class="sx-rn">
                                                        <b>{song.name}</b>
                                                        <Show when={song.onSite}>
                                                            <span class="sx-mark">
                                                                <i />
                                                                on the site
                                                            </span>
                                                        </Show>
                                                    </span>
                                                    <span class="sx-rm">
                                                        {song.bpm ? `${Math.round(song.bpm)} bpm, ` : ''}
                                                        {song.patterns} {song.patterns === 1 ? 'pattern' : 'patterns'}
                                                        <Show when={song.changed}>
                                                            <i class="sx-dirty" />
                                                            changed since saved
                                                        </Show>
                                                    </span>
                                                </span>
                                                <span class="sx-rw">{whenText(song.changedAt, now())}</span>
                                            </button>
                                        </li>
                                    )}
                                </For>
                            </ul>
                        </div>
                    </Show>

                    <div class="sx-acc" data-testid="start-account">
                        <div class="sx-acc-h">
                            <h2>Your account</h2>
                        </div>
                        <Show
                            when={me()}
                            fallback={
                                <>
                                    <p class="sx-acc-t">An account is only for publishing songs. Making music needs none.</p>
                                    <AccountForm />
                                </>
                            }
                        >
                            {(who) => (
                                <>
                                    <div class="sx-who">
                                        <i class="sx-who-a">{letter(who().name)}</i>
                                        <div>
                                            <b>{who().name}</b>
                                            <span>{who().email}</span>
                                        </div>
                                        <button class="btn" onClick={openAccount}>
                                            Your account
                                        </button>
                                        <button class="pb-forgot" onClick={() => void signOutOfSite()}>
                                            Sign out
                                        </button>
                                    </div>
                                    <p class="sx-acc-t" data-testid="start-count">
                                        You have used {who().used} of your {who().most} songs.
                                    </p>
                                </>
                            )}
                        </Show>
                    </div>
                </section>

                <section class="sx-site" aria-label="Songs on the site">
                    <div class="sx-pub">
                        <div class="sx-pub-h">
                            <h3>Songs on the site</h3>
                        </div>
                        <p class="sx-pub-t">Songs people made in Weft and published. Listen to half a minute, or open a copy and it is a song of yours.</p>
                        <div class="sx-pub-q">
                            <div class="sx-find">
                                <svg viewBox="0 0 16 16">
                                    <circle cx="7" cy="7" r="4.5" />
                                    <path d="M10.5 10.5 14 14" />
                                </svg>
                                <input placeholder="Search by name, maker or style" aria-label="Search the songs on the site" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} />
                            </div>
                            <span class="grow" />
                            <div class="seg" role="group" aria-label="Order">
                                <For each={ORDERS}>
                                    {(one) => (
                                        <button classList={{ on: order() === one.id }} aria-pressed={order() === one.id} onClick={() => setOrder(one.id)}>
                                            {one.label}
                                        </button>
                                    )}
                                </For>
                            </div>
                        </div>
                        <div class="sx-pub-l" data-testid="start-site">
                            <Show when={reached() === 'no'}>
                                <div class="sx-pub-n" role="status">
                                    <b>The site could not be reached.</b>
                                    <span>Your own songs are all here. The songs on the site come back when you are online.</span>
                                    <button class="btn" onClick={() => void ask()}>
                                        Try again
                                    </button>
                                </div>
                            </Show>
                            <Show when={reached() === 'yes' && !found().length}>
                                <div class="sx-pub-n">
                                    <b>Nothing is published yet.</b>
                                    <span>A song is published from the song menu, with Publish.</span>
                                </div>
                            </Show>
                            <For each={listed()}>
                                {(song) => (
                                    <div class="sx-row" classList={{ now: playing() === song.id }} style={{ '--played': playing() === song.id ? `${Math.min(100, (heard().at / Math.max(1, heard().of)) * 100)}%` : '0%' }}>
                                        <button class="sx-hear" aria-label={playing() === song.id ? `Stop ${song.name}` : `Hear half a minute of ${song.name}`} aria-pressed={playing() === song.id} onClick={() => hear(song)}>
                                            <svg viewBox="0 0 16 16">
                                                <path d={playing() === song.id ? 'M4 2.8h3v10.4H4zM9 2.8h3v10.4H9z' : 'M4.8 2.6v10.8L13.4 8z'} />
                                            </svg>
                                        </button>
                                        <div class="sx-row-t">
                                            <b>{song.name}</b>
                                            <span class="sx-by">
                                                <i style={{ '--who': colourOf(song.by) }}>{letter(song.by)}</i>
                                                {song.by}
                                                <Show when={playing() === song.id}>
                                                    <span class="sx-at">
                                                        {clock(heard().at)} of {clock(heard().of)}
                                                    </span>
                                                </Show>
                                            </span>
                                        </div>
                                        <span>
                                            <Show when={song.style}>
                                                <span class="chip">{song.style}</span>
                                            </Show>
                                        </span>
                                        <span class="sx-num">{song.tempo ? `${Math.round(song.tempo)} bpm` : ''}</span>
                                        <span class="sx-num">
                                            {song.patterns.length} {song.patterns.length === 1 ? 'pattern' : 'patterns'}
                                        </span>
                                        <span class="sx-num">
                                            {song.downloads} {song.downloads === 1 ? 'download' : 'downloads'}
                                        </span>
                                        <button class="sb-u" disabled={opening() !== null} onClick={() => void copyOf(song)}>
                                            {opening() === song.id ? 'Opening' : 'Open a copy'}
                                        </button>
                                    </div>
                                )}
                            </For>
                        </div>
                        <div class="sx-pub-e" data-testid="start-site-count">
                            <Show when={reached() === 'yes'} fallback={reached() === 'asking' ? 'Asking the site for its songs.' : ''}>
                                {query().trim() ? `${listed().length} of ${found().length} ${found().length === 1 ? 'song' : 'songs'}.` : `${found().length} ${found().length === 1 ? 'song' : 'songs'}.`}
                                <Show when={opening() === null ? songNote() : null}>{(said) => <span class="sx-warn">&nbsp;{said()}</span>}</Show>
                            </Show>
                        </div>
                    </div>
                </section>

                <footer class="sx-bar">
                    <div class="grow" />
                    <span>
                        Free and open source. Sound engine: <b>Strudel</b>
                    </span>
                </footer>
            </div>
        </Show>
    )
}
