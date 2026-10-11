import { batch } from 'solid-js'
import type { Engine } from '../engine/engine'
import { openLine, type Line } from '../jam/line'
import {
    arrivedAt,
    cleanName,
    cleanSay,
    digestOf,
    DRIFT,
    packPiece,
    PIECE,
    piecesOf,
    readInvite,
    readPiece,
    SOUND_LIMIT,
    type Bars,
    type FromRelay,
    type Offer,
    type Told,
} from '../jam/protocol'
import { sizeText } from '../library/audio'
import { soundRenames, soundsUsed } from '../library/songfile'
import { soundNameFor, type OwnSound } from '../library/sounds'
import { jamLines, jamName, jamPeer, jamsOpen, jamStage, jamUnread, setJamHand, setJamInvite, setJamLines, setJamName, setJamNote, setJamPeer, setJamStage, setJamUnread, type JamLine } from '../stores/jam'
import { engineState, loopBars, ownSounds, playMode, song, stale, startBar, type PlayMode } from '../stores/song'

// Two people on one song. Each machine makes its own sound from the same code: what travels is
// every change to the code, when the song is started and stopped, what is said, and the sounds
// of your own that the song uses. The one who made the invite is the host, and it is the host's
// song that both are on; the other gets a copy of it among their songs, kept as the jam goes.
export type JamDeps = {
    engine: Engine
    songName(): string
    songKeys(): Record<string, string>
    openAs(name: string, code: string, keys: Record<string, string>, mode: PlayMode): void
    guardSong(): void
    startFrom(bar: number): void
    setLoop(range: Bars | null): void
    setMode(mode: PlayMode): void
    ownSound(name: string): Promise<OwnSound | null>
    keepSound(sound: OwnSound): Promise<void>
    lendSound(sound: OwnSound): Promise<void>
    restoreSound(name: string): Promise<void>
    replay(): void
}

const RELAY: string = import.meta.env.VITE_JAM_RELAY ?? 'ws://127.0.0.1:5190'
const NAME_KEY = 'weft.name'
const PING_EVERY = 4000
const HAND_FOR = 8000
const MOST_LINES = 200
const SOUND_NAME = /^[a-z][a-z0-9_]{0,59}$/
const UNREACHABLE = 'Jams could not be reached. Check that you are online, then try again.'

let deps: JamDeps
let line: Line | null = null
let host = false
// True while something the other person did is being done here, so that it is not sent back.
let applying = false
let pinging = 0
let pingCount = 0
const pings = new Map<number, number>()
let roundTrip = 0
let placed = false
let handTimer = 0
// What each pattern read after the last change, to tell what a change of theirs touched.
let texts = new Map<string, string>()
// The sounds of your own in the song: `known` are named by its code now, `offered` are yours and
// were offered to the other, `theirs` came from them, and `lent` are those of theirs that play
// here under a name one of yours also has, for as long as the jam lasts. `had` are the offers
// of theirs that were answered.
let known = new Set<string>()
const offered = new Set<string>()
const theirs = new Set<string>()
const had = new Set<string>()
const lent = new Map<string, OwnSound>()
const incoming = new Map<string, { offer: Offer; parts: Uint8Array[]; got: number; shadow: boolean }>()

const peer = () => jamPeer() ?? 'They'
const ownNames = () => ownSounds().map((sound) => sound.name)

function add(entry: JamLine) {
    const lines = jamLines()
    const last = lines[lines.length - 1]
    if (entry.kind === 'event' && last?.kind === 'event' && last.text === entry.text) return
    setJamLines([...lines, entry].slice(-MOST_LINES))
}
const event = (text: string) => add({ kind: 'event', text })

// Told to the other person, unless it is their own doing that is being followed.
export function tellJam(told: Told) {
    if (line && jamStage() === 'jamming' && !applying) line.send({ t: 'tell', d: told })
}

function follow(work: () => void) {
    applying = true
    try {
        work()
    } finally {
        applying = false
    }
}

export function attachJam(given: JamDeps) {
    deps = given
    setJamName(cleanName(localStorage.getItem(NAME_KEY) ?? ''))
    deps.engine.onMoved(tellJam)
    deps.engine.onCodeChange(codeChanged)
}

export function nameYourself(text: string) {
    const name = cleanName(text)
    setJamName(name)
    localStorage.setItem(NAME_KEY, name)
    if (name) setJamNote(null)
}

const named = (): boolean => {
    if (jamName()) return true
    setJamNote('Type a name first, so the other person knows who they are playing with.')
    return false
}

// ---- starting and ending

async function reach(first: object): Promise<boolean> {
    try {
        line = await openLine(RELAY, { message: fromRelay, bytes: pieceArrived, closed: lineLost })
        line.send(first)
        return true
    } catch {
        line = null
        batch(() => {
            setJamStage('idle')
            setJamNote(UNREACHABLE)
        })
        return false
    }
}

export async function inviteToJam() {
    if (jamStage() !== 'idle' || !named()) return
    host = true
    batch(() => {
        setJamNote(null)
        setJamStage('calling')
    })
    await reach({ t: 'host', name: jamName() })
}

export async function joinJam(text: string) {
    if (jamStage() !== 'idle' || !named()) return
    const code = readInvite(text)
    if (!code) return void setJamNote('That is not an invite. An invite is six letters and digits, like 7KQ-M2D. Type it as you were given it.')
    host = false
    batch(() => {
        setJamNote(null)
        setJamStage('joining')
    })
    await reach({ t: 'join', code, name: jamName() })
}

export function leaveJam() {
    const stage = jamStage()
    if (stage === 'idle') return
    line?.send({ t: 'leave' })
    finish(stage === 'jamming' ? `You left the jam with ${peer()}. ${deps.songName()} stays with your songs as it is now.` : null)
}

function finish(note: string | null) {
    const was = jamStage()
    window.clearInterval(pinging)
    window.clearTimeout(handTimer)
    line?.close()
    line = null
    deps.engine.stopSync()
    if (was === 'jamming') void giveBack()
    host = false
    placed = false
    roundTrip = 0
    pings.clear()
    known = new Set()
    offered.clear()
    theirs.clear()
    had.clear()
    incoming.clear()
    texts = new Map()
    batch(() => {
        setJamStage('idle')
        setJamInvite(null)
        setJamPeer(null)
        setJamHand(null)
        setJamLines([])
        setJamUnread(0)
        setJamNote(note)
    })
}

function lineLost() {
    finish(jamStage() === 'jamming' ? `The line to ${peer()} was lost, so the jam is over. ${deps.songName()} stays with your songs as it is now.` : UNREACHABLE)
}

function begin(who: string, joined: string) {
    batch(() => {
        setJamPeer(who)
        setJamInvite(null)
        setJamLines([])
        setJamNote(null)
        setJamStage('jamming')
    })
    event(joined)
    texts = patternTexts(deps.engine.getCode())
    window.clearInterval(pinging)
    ping()
    pinging = window.setInterval(ping, PING_EVERY)
}

// ---- what the relay says

function fromRelay(message: FromRelay) {
    if (message.t === 'invite') {
        return batch(() => {
            setJamInvite(message.code)
            setJamStage('waiting')
        })
    }
    if (message.t === 'no') {
        return finish(message.why === 'full' ? 'Jams are full at the moment. Try again in a little while.' : 'No jam is waiting under that invite. It may have been used already, or taken back. Ask for a new one.')
    }
    if (message.t === 'over') {
        if (message.why === 'expired') return finish('The invite ran out because nobody used it. Make a new one when you are ready.')
        return finish(jamStage() === 'jamming' ? `${peer()} left the jam. ${deps.songName()} stays with your songs as it is now.` : null)
    }
    // Someone used the invite. From here on the code is shared, and the first thing they are
    // sent is the song as it is at this moment.
    if (message.t === 'joined') {
        if (jamStage() !== 'waiting') return
        deps.guardSong()
        const code = deps.engine.getCode()
        deps.engine.startSync(0, 'host', push)
        line?.send({ t: 'tell', d: { k: 'song', name: deps.songName(), code, keys: deps.songKeys(), start: startBar(), loop: loopBars(), mode: playMode() } satisfies Told })
        begin(message.name, `${message.name} joined. You are both on ${deps.songName()}.`)
        known = new Set()
        codeChanged(code, false)
        return
    }
    if (message.t === 'in') return void setJamPeer(message.name)
    if (message.t === 'updates') return deps.engine.receive(message.updates)
    if (message.t === 'told') return told(message.d)
}

const push = (version: number, updates: unknown[]) => line?.send({ t: 'push', v: version, updates })

function told(d: Told) {
    if (!d || typeof d !== 'object') return
    if (d.k === 'song') {
        if (host || jamStage() !== 'joining') return
        follow(() => {
            deps.openAs(String(d.name), String(d.code), d.keys && typeof d.keys === 'object' ? d.keys : {}, d.mode === 'live' ? 'live' : 'song')
            deps.startFrom(Number(d.start) || 0)
            deps.setLoop(d.loop ?? null)
        })
        deps.engine.startSync(0, 'guest', push)
        known = new Set(soundsUsed(deps.engine.getCode(), ownNames()))
        return begin(peer(), `You joined ${peer()}. You are both on ${deps.songName()}.`)
    }
    if (jamStage() !== 'jamming') return
    if (d.k === 'say') {
        const text = cleanSay(String(d.text ?? ''))
        if (!text) return
        add({ kind: 'said', mine: false, who: peer(), text })
        if (!jamsOpen()) setJamUnread(jamUnread() + 1)
        return
    }
    if (d.k === 'play') return follow(() => deps.engine.playAt(arrivedAt(Number(d.at) || 0, roundTrip, deps.engine.bpm())))
    if (d.k === 'pause') return follow(() => deps.engine.pauseAt(Number(d.at) || 0))
    if (d.k === 'stop') return follow(() => deps.engine.stop())
    if (d.k === 'start') return follow(() => deps.startFrom(Math.max(0, Math.floor(Number(d.bar) || 0))))
    if (d.k === 'loop') return follow(() => deps.setLoop(d.range && d.range.to > d.range.from ? { from: Math.max(0, Math.floor(d.range.from)), to: Math.floor(d.range.to) } : null))
    if (d.k === 'mode') return follow(() => deps.setMode(d.mode === 'live' ? 'live' : 'song'))
    if (d.k === 'ping') return tellJam({ k: 'pong', n: d.n, at: engineState().playing ? deps.engine.now() : null })
    if (d.k === 'pong') return ponged(d.n, d.at)
    if (d.k === 'where') return whereNow()
    if (d.k === 'offer') return void offeredOne(d)
    if (d.k === 'want') return void sendSound(String(d.name))
}

export function sayInJam(words: string) {
    const text = cleanSay(words)
    if (!text || jamStage() !== 'jamming') return
    add({ kind: 'said', mine: true, who: jamName(), text })
    tellJam({ k: 'say', text })
}

// ---- playing together. Each machine keeps its own time. The one who joined asks where the
// host's song is once the line has been timed, and is set right again if the two run apart.

function ping() {
    const n = ++pingCount
    pings.set(n, performance.now())
    tellJam({ k: 'ping', n })
}

function whereNow() {
    const state = engineState()
    if (state.playing) tellJam({ k: 'play', at: deps.engine.now() })
    else if (state.paused) tellJam({ k: 'pause', at: deps.engine.now() })
}

function ponged(n: number, at: number | null) {
    const sent = pings.get(n)
    pings.clear()
    if (sent === undefined) return
    const took = performance.now() - sent
    roundTrip = roundTrip ? Math.min(roundTrip, took) : took
    if (host) return
    if (!placed) {
        placed = true
        return tellJam({ k: 'where' })
    }
    if (at === null || !engineState().playing || loopBars()) return
    const there = arrivedAt(at, took, deps.engine.bpm())
    if (Math.abs(there - deps.engine.now()) > DRIFT) follow(() => deps.engine.playAt(there))
}

// ---- what the other person is working on

function patternTexts(code: string): Map<string, string> {
    return new Map(song().patterns.map((block) => [block.id, code.slice(block.from, block.to)]))
}

const body = (text: string) => text.slice(text.indexOf(':') + 1)

function theirChange(before: Map<string, string>, now: Map<string, string>) {
    const changed = [...now].filter(([id, text]) => before.has(id) && before.get(id) !== text).map(([id]) => id)
    const added = [...now.keys()].filter((id) => !before.has(id))
    const gone = [...before.keys()].filter((id) => !now.has(id))
    let hand: string | null = changed[0] ?? added[0] ?? null
    if (added.length === 1 && gone.length === 1 && body(now.get(added[0])!) === body(before.get(gone[0])!)) {
        event(`${peer()} renamed ${gone[0]} to ${added[0]}`)
    } else {
        for (const id of added) event(`${peer()} added ${id}`)
        for (const id of gone) event(`${peer()} removed ${id}`)
    }
    if (changed.length > 2) {
        event(`${peer()} changed ${changed.length} patterns`)
        hand = null
    } else {
        for (const id of changed) event(`${peer()} changed ${id}`)
    }
    if (!hand) return
    setJamHand(hand)
    window.clearTimeout(handTimer)
    handTimer = window.setTimeout(() => setJamHand(null), HAND_FOR)
}

function codeChanged(code: string, remote: boolean) {
    if (jamStage() !== 'jamming') return
    if (!stale()) {
        const now = patternTexts(code)
        if (remote) theirChange(texts, now)
        texts = now
    }
    // A sound of your own goes to the other person when a change of yours brings it into the
    // song. One that a change of theirs brought in is theirs to send, whatever it is called.
    const used = soundsUsed(code, ownNames())
    for (const name of used) {
        if (known.has(name) || offered.has(name) || theirs.has(name)) continue
        if (remote) theirs.add(name)
        else void offer(name)
    }
    known = new Set(used)
}

// ---- sounds of your own

async function offer(name: string) {
    offered.add(name)
    const sound = await deps.ownSound(name)
    if (!sound || jamStage() !== 'jamming') return
    if (sound.data.byteLength > SOUND_LIMIT) {
        return event(`Your sound ${name} is too big to send (${sizeText(sound.data.byteLength)}, the most is ${sizeText(SOUND_LIMIT)}), so ${peer()} does not hear it. A shorter take of it, or an MP3, would go through.`)
    }
    tellJam({ k: 'offer', name, digest: await digestOf(sound.data), file: sound.file, type: sound.type, seconds: sound.seconds, bytes: sound.data.byteLength })
}

// A sound is taken when it is not already here. One whose name is also the name of a sound of
// yours, and is not the same sound, plays in place of yours for as long as the jam lasts. When
// both bring a sound of the same name at the same moment, the host's is the one that stays.
async function offeredOne(d: Offer) {
    const name = String(d.name)
    if (!SOUND_NAME.test(name) || incoming.has(name) || !(d.bytes > 0) || d.bytes > SOUND_LIMIT) return
    if (had.has(name) || (offered.has(name) && host)) return
    const mine = ownNames().includes(name)
    if (!mine && deps.engine.soundTaken(name)) return
    theirs.add(name)
    had.add(name)
    if (mine && (await sameAsMine(name, String(d.digest)))) return
    if (jamStage() !== 'jamming') return
    incoming.set(name, { offer: { ...d, name }, parts: [], got: 0, shadow: mine })
    tellJam({ k: 'want', name })
}

async function sameAsMine(name: string, digest: string): Promise<boolean> {
    const sound = await deps.ownSound(name)
    return Boolean(sound) && (await digestOf(sound!.data)) === digest
}

// Only what was offered is sent: nobody can ask for a sound of yours that is not in the song.
async function sendSound(name: string) {
    if (!offered.has(name)) return
    const sound = await deps.ownSound(name)
    if (!sound) return
    const bytes = new Uint8Array(sound.data)
    const parts = piecesOf(bytes.length)
    for (let part = 0; part < parts; part++) {
        if (!line || jamStage() !== 'jamming') return
        await line.sendBytes(packPiece({ name, part, parts, bytes: bytes.subarray(part * PIECE, (part + 1) * PIECE) }))
    }
}

function pieceArrived(frame: ArrayBuffer) {
    const piece = readPiece(frame)
    const waiting = piece ? incoming.get(piece.name) : undefined
    if (!piece || !waiting || piece.parts !== piecesOf(waiting.offer.bytes) || waiting.parts[piece.part]) return
    waiting.parts[piece.part] = piece.bytes.slice()
    if (++waiting.got < piece.parts) return
    incoming.delete(piece.name)
    const data = new Uint8Array(waiting.offer.bytes)
    let at = 0
    for (const part of waiting.parts) {
        if (at + part.length > data.length) return
        data.set(part, at)
        at += part.length
    }
    if (at !== data.length) return
    const { offer: about } = waiting
    const sound: OwnSound = {
        name: about.name,
        file: String(about.file || about.name).slice(0, 120),
        seconds: Number(about.seconds) || 0,
        addedAt: Date.now(),
        type: /^audio\/[\w.+-]+$/.test(String(about.type)) ? about.type : '',
        data: data.buffer,
    }
    void arrived(sound, waiting.shadow)
}

async function arrived(sound: OwnSound, shadow: boolean) {
    if (jamStage() !== 'jamming') return
    try {
        if (shadow) {
            lent.set(sound.name, sound)
            await deps.lendSound(sound)
            event(`${peer()} brought the sound ${sound.name}. You have one of that name, so theirs plays in its place while you jam.`)
        } else {
            await deps.keepSound(sound)
            event(`${peer()} brought the sound ${sound.name}. It is now among yours.`)
        }
        deps.replay()
    } catch {
        event(`The sound ${sound.name} that ${peer()} brought could not be kept, so it is silent here.`)
    }
}

// When the jam is over, a sound of theirs that played in place of one of yours is kept under a
// name of its own, the song is made to say that name, and yours is yours again.
async function giveBack() {
    const kept = [...lent]
    lent.clear()
    for (const [name, sound] of kept) {
        try {
            const code = deps.engine.getCode()
            if (soundsUsed(code, [name]).length) {
                const free = soundNameFor(name, (taken) => taken === name || deps.engine.soundTaken(taken))
                await deps.keepSound({ ...sound, name: free })
                deps.engine.applyEdit(soundRenames(deps.engine.getCode(), name, free))
            }
            await deps.restoreSound(name)
        } catch {
            continue
        }
    }
    if (kept.length) deps.replay()
}
