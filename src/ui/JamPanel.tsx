import { createEffect, createSignal, For, Match, on, onCleanup, Show, Switch } from 'solid-js'
import { toggleJams } from '../app/controller'
import { askToJoin, cancelAsk, inviteToJam, joinJam, leaveJam, nameYourself, openToJam, refreshOpenJams, sayInJam, toggleCam, toggleMic } from '../app/jam'
import { aboutText, NAME_LIMIT, SAY_LIMIT, showInvite } from '../jam/protocol'
import {
    jamAsked,
    jamCam,
    jamInvite,
    jamLevels,
    jamLines,
    jamListed,
    jamMic,
    jamming,
    jamName,
    jamNote,
    jamOwn,
    jamPeer,
    jamPictures,
    jamsOpen,
    jamStage,
    jamTheirCam,
    jamTheirMic,
    jamTurnedDown,
    jamVoiceNote,
    openJams,
} from '../stores/jam'
import { currentSong } from '../stores/song'
import { Fold, isFolded } from './Fold'

const HEARD = 0.02
const BARS = [0.5, 1, 0.7]
const LOOK_EVERY = 5000
const HUES = ['var(--woad)', 'var(--orchil)', 'var(--saffron)', 'var(--lichen)', 'var(--madder)']
export const letter = (name: string | null) => (name ?? '').trim().charAt(0).toUpperCase() || '?'
// The same name has the same colour wherever it is shown.
export const hueOf = (name: string) => HUES[[...name].reduce((mixed, char) => (mixed * 31 + char.codePointAt(0)!) % 9973, 7) % HUES.length]

// What a camera shows. A picture from a call does not always start to move by itself, so it is
// told to, and again whenever it is another picture.
function Picture(props: { of: MediaStream }) {
    let video!: HTMLVideoElement
    createEffect(() => {
        video.srcObject = props.of
        void video.play().catch(() => undefined)
    })
    return <video ref={video} autoplay playsinline muted />
}

// One of the two people in a jam: who it is, their picture when their camera is on, whether
// their microphone is on, and how loud they are at this moment.
function Tile(props: { name: string; shown: string; on: boolean; level: number; picture: MediaStream | null; mine?: boolean; testid: string }) {
    return (
        <div class="jm-cam" classList={{ me: props.mine }} data-testid={props.testid} data-mic={props.on ? 'on' : 'off'} data-cam={props.picture ? 'on' : 'off'} data-sound={props.on && props.level > HEARD ? 'yes' : 'no'}>
            <Show when={props.picture} fallback={<i>{letter(props.name)}</i>}>
                {(picture) => <Picture of={picture()} />}
            </Show>
            <span>{props.shown}</span>
            <Show when={props.on} fallback={<em>mic off</em>}>
                <div class="jm-lvl" aria-hidden="true">
                    <For each={BARS}>{(share) => <u style={{ height: `${3 + Math.round(props.level * share * 10)}px` }} />}</For>
                </div>
            </Show>
        </div>
    )
}

// Two people on one song. Before a jam this is where one is started: by an invite made or typed
// in, or by being open to anyone and asking those who are. During one it is who you are with
// and what you say to each other.
export function JamPanel() {
    let chat: HTMLDivElement | undefined
    let say: HTMLInputElement | undefined
    const [typed, setTyped] = createSignal('')
    const [copied, setCopied] = createSignal(false)
    const busy = () => jamStage() === 'calling' || jamStage() === 'joining'
    const others = () => openJams()?.filter((jam) => jam.id !== jamOwn()) ?? []

    // The list is looked at for as long as it is in sight.
    createEffect(() => {
        if (!jamsOpen() || jamming()) return
        void refreshOpenJams()
        const looking = window.setInterval(() => document.hidden || void refreshOpenJams(), LOOK_EVERY)
        onCleanup(() => window.clearInterval(looking))
    })

    createEffect(
        on(
            () => jamLines().length,
            () => queueMicrotask(() => chat?.scrollTo({ top: chat.scrollHeight })),
        ),
    )

    const copy = async () => {
        const invite = jamInvite()
        if (!invite) return
        try {
            await navigator.clipboard.writeText(showInvite(invite))
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1600)
        } catch {
            setCopied(false)
        }
    }

    return (
        <Show when={jamsOpen()}>
            <aside class="jm" classList={{ folded: isFolded('jams') }} aria-label={jamming() ? `Jam with ${jamPeer()}` : 'Jams'} data-testid="jams">
                <div class="jm-h">
                    <Fold panel="jams" name="the jam" />
                    <h2>{jamming() ? `Jam with ${jamPeer()}` : 'Jams'}</h2>
                    <span class="grow" />
                    <Show
                        when={jamming()}
                        fallback={
                            <button class="ib" aria-label="Close jams" onClick={toggleJams}>
                                <svg viewBox="0 0 16 16">
                                    <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
                                </svg>
                            </button>
                        }
                    >
                        <button class="btn" title="Ends the jam for both of you. You each keep the song as it is now." onClick={leaveJam}>
                            Leave
                        </button>
                    </Show>
                </div>
                <Show
                    when={jamming()}
                    fallback={
                        <div class="jm-b">
                            <label class="jm-f">
                                <span class="cap">You are</span>
                                <input
                                    value={jamName()}
                                    maxLength={NAME_LIMIT}
                                    placeholder="Your name"
                                    aria-label="Your name"
                                    disabled={jamStage() !== 'idle' || Boolean(jamAsked())}
                                    onChange={(event) => nameYourself(event.currentTarget.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') event.currentTarget.blur()
                                    }}
                                />
                            </label>
                            <button class="jm-sw" role="switch" aria-checked={jamListed()} disabled={busy()} onClick={() => openToJam(!jamListed())}>
                                <i classList={{ on: jamListed() }} />
                                <b>Open to jam</b>
                                <span>People in the list can see you and ask to join. Off, nobody sees you.</span>
                            </button>
                            <Switch>
                                <Match when={jamStage() === 'waiting' ? jamInvite() : null}>
                                    {(invite) => (
                                        <div class="jm-g">
                                            <div class="jm-inv">
                                                <span class="jm-code" data-testid="jam-invite">
                                                    {showInvite(invite())}
                                                </span>
                                                <button class="btn" onClick={copy}>
                                                    {copied() ? 'Copied' : 'Copy invite'}
                                                </button>
                                            </div>
                                            <p class="jm-note">{jamListed() ? 'Or send this to one person. They open Jams in Weft and type it in. It works once, listed or not.' : 'Send this to one person. They open Jams in Weft and type it in. It works once.'}</p>
                                            <p class="jm-note" role="status">
                                                Waiting for them to join <b>{currentSong()?.name}</b>.
                                            </p>
                                            <button class="chip tgl" onClick={leaveJam}>
                                                {jamListed() ? 'Stop waiting' : 'Take the invite back'}
                                            </button>
                                        </div>
                                    )}
                                </Match>
                                <Match when={true}>
                                    <div class="jm-g">
                                        <button class="btn go" disabled={busy()} onClick={() => void inviteToJam()}>
                                            Invite someone
                                        </button>
                                        <p class="jm-note">
                                            Either way they join the song that is open, <b>{currentSong()?.name}</b>, and what one changes the other sees and hears.
                                        </p>
                                    </div>
                                    <div class="jm-g">
                                        <form
                                            class="jm-inv"
                                            onSubmit={(event) => {
                                                event.preventDefault()
                                                void joinJam(typed())
                                            }}
                                        >
                                            <input class="jm-code" placeholder="An invite, like 7KQ-M2D" aria-label="Invite" value={typed()} maxLength={80} onInput={(event) => setTyped(event.currentTarget.value)} />
                                            <button class="btn" disabled={busy()}>
                                                Join
                                            </button>
                                        </form>
                                        <p class="jm-note">You join their song. It is kept with your songs, and the songs you have stay as they are.</p>
                                    </div>
                                </Match>
                            </Switch>
                            <Show when={jamNote()}>
                                <p class="jm-n" role="status" data-testid="jam-note">
                                    {jamNote()}
                                </p>
                            </Show>
                            <section class="jm-open" aria-label="Open to jam now" data-testid="open-jams">
                                <h3>
                                    Open to jam now <Show when={others().length}>{<span>{others().length}</span>}</Show>
                                </h3>
                                <Show when={openJams()} fallback={<p class="jm-note">The list could not be read. Check that you are online. It is looked at again every few seconds.</p>}>
                                    <Show when={others().length} fallback={<p class="jm-note">{jamListed() ? 'Nobody else is open to jam right now.' : 'Nobody is open to jam right now. Switch on Open to jam and you are the first in the list.'}</p>}>
                                        <For each={others()}>
                                            {(jam) => (
                                                <div class="jm-o" data-testid="open-jam">
                                                    <i style={{ '--who': hueOf(jam.name) }}>{letter(jam.name)}</i>
                                                    <div class="jm-on">
                                                        <b>{jam.name}</b>
                                                        <span>{aboutText(jam)}</span>
                                                    </div>
                                                    <Switch>
                                                        <Match when={jamAsked()?.id === jam.id}>
                                                            <span class="jm-as" role="status">
                                                                Asked. <button onClick={cancelAsk}>Cancel</button>
                                                            </span>
                                                        </Match>
                                                        <Match when={jamTurnedDown().includes(jam.id)}>
                                                            <span class="jm-as">Not now</span>
                                                        </Match>
                                                        <Match when={true}>
                                                            <button class="btn" disabled={busy() || Boolean(jamAsked())} aria-label={`Ask to join ${jam.name}`} onClick={() => void askToJoin(jam)}>
                                                                Ask to join
                                                            </button>
                                                        </Match>
                                                    </Switch>
                                                </div>
                                            )}
                                        </For>
                                    </Show>
                                </Show>
                            </section>
                        </div>
                    }
                >
                    <div class="jm-cams" classList={{ seen: jamCam() || jamTheirCam() }}>
                        <Tile name={jamPeer() ?? ''} shown={jamPeer() ?? ''} on={jamTheirMic()} level={jamLevels().theirs} picture={jamTheirCam() ? jamPictures().theirs : null} testid="jam-them" />
                        <Tile name={jamName()} shown="You" on={jamMic()} level={jamLevels().mine} picture={jamCam() ? jamPictures().mine : null} mine testid="jam-me" />
                    </div>
                    <div class="jm-ctl">
                        <button class="ib jm-tg" classList={{ on: jamMic() }} aria-pressed={jamMic()} aria-label="Microphone" title={jamMic() ? 'Your microphone is on. Press to switch it off.' : `Switch your microphone on, so ${jamPeer()} hears you`} onClick={() => void toggleMic()}>
                            <svg viewBox="0 0 16 16" aria-hidden="true">
                                <rect x="6" y="1.8" width="4" height="7.6" rx="2" />
                                <path class="ln" d="M3.6 7.4a4.4 4.4 0 0 0 8.8 0M8 11.8v2.4M5.7 14.2h4.6" />
                            </svg>
                        </button>
                        <button class="ib jm-tg" classList={{ on: jamCam() }} aria-pressed={jamCam()} aria-label="Camera" title={jamCam() ? 'Your camera is on. Press to switch it off.' : `Switch your camera on, so ${jamPeer()} sees you`} onClick={() => void toggleCam()}>
                            <svg viewBox="0 0 16 16" aria-hidden="true">
                                <rect x="1.6" y="4" width="9" height="8" rx="1.8" />
                                <path d="M11.4 7.2 14.4 5v6l-3-2.2z" />
                            </svg>
                        </button>
                        <span class="grow" />
                        <span class="jm-note">Use headphones</span>
                    </div>
                    <Show when={jamVoiceNote()}>
                        <p class="jm-n in" role="status" data-testid="jam-voice-note">
                            {jamVoiceNote()}
                        </p>
                    </Show>
                    <div class="jm-chat" role="log" aria-label="What was said" ref={chat} data-testid="jam-chat">
                        <For each={jamLines()}>
                            {(line) =>
                                line.kind === 'event' ? (
                                    <span class="jm-ev">{line.text}</span>
                                ) : (
                                    <div class="jm-m" classList={{ me: line.mine }}>
                                        <Show when={!line.mine}>
                                            <b>{line.who}</b>
                                        </Show>
                                        {line.text}
                                    </div>
                                )
                            }
                        </For>
                    </div>
                    <form
                        class="jm-say"
                        onSubmit={(event) => {
                            event.preventDefault()
                            if (!say) return
                            sayInJam(say.value)
                            say.value = ''
                        }}
                    >
                        <input ref={say} placeholder="Say something" aria-label="Message" maxLength={SAY_LIMIT} />
                        <button class="btn">Send</button>
                    </form>
                </Show>
            </aside>
        </Show>
    )
}
