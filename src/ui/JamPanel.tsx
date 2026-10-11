import { createEffect, createSignal, For, Match, on, Show, Switch } from 'solid-js'
import { toggleJams } from '../app/controller'
import { inviteToJam, joinJam, leaveJam, nameYourself, sayInJam } from '../app/jam'
import { NAME_LIMIT, SAY_LIMIT, showInvite } from '../jam/protocol'
import { jamInvite, jamLines, jamming, jamName, jamNote, jamPeer, jamsOpen, jamStage } from '../stores/jam'
import { currentSong } from '../stores/song'

// Two people on one song. Before a jam this is where one is started, by an invite made or an
// invite typed in; during one it is who you are with and what you say to each other.
export function JamPanel() {
    let chat: HTMLDivElement | undefined
    let say: HTMLInputElement | undefined
    const [typed, setTyped] = createSignal('')
    const [copied, setCopied] = createSignal(false)
    const busy = () => jamStage() === 'calling' || jamStage() === 'joining'

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
            <aside class="jm" aria-label={jamming() ? `Jam with ${jamPeer()}` : 'Jams'} data-testid="jams">
                <div class="jm-h">
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
                            <p class="jm-note">Two people on one song, each on their own machine. What one changes, the other sees and hears.</p>
                            <label class="jm-f">
                                <span class="cap">You are</span>
                                <input
                                    value={jamName()}
                                    maxLength={NAME_LIMIT}
                                    placeholder="Your name"
                                    aria-label="Your name"
                                    disabled={jamStage() !== 'idle'}
                                    onChange={(event) => nameYourself(event.currentTarget.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') event.currentTarget.blur()
                                    }}
                                />
                            </label>
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
                                            <p class="jm-note">Send this to one person. They open Jams in Weft and type it in. It works once.</p>
                                            <p class="jm-note" role="status">
                                                Waiting for them to join <b>{currentSong()?.name}</b>.
                                            </p>
                                            <button class="chip tgl" onClick={leaveJam}>
                                                Take the invite back
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
                                            They join the song that is open, <b>{currentSong()?.name}</b>.
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
                        </div>
                    }
                >
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
