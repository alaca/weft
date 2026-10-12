import { history, isolateHistory, redo, undo } from '@codemirror/commands'
import { Annotation, EditorState, Prec, StateEffect, Transaction } from '@codemirror/state'
import { EditorView, keymap, tooltips } from '@codemirror/view'
import { BlockWidget, StrudelMirror, codemirrorSettings, sliderPlugin } from '@strudel/codemirror'
import { Pattern, silence } from '@strudel/core'
import { mini } from '@strudel/mini'
import {
    getAudioContext,
    getSuperdoughAudioController,
    initAudio,
    initAudioOnFirstClick,
    setAudioContext,
    setSuperdoughAudioController,
    soundMap,
    superdough,
    webaudioOutput,
} from '@strudel/webaudio'
import { checkSong } from '../guard/check'
import type { SentUpdate } from '../jam/protocol'
import { DEFAULT_MIX, fitMix, type Mix } from '../library/mix'
import type { PatternEvent, TextEdit } from '../song/types'
import { barByBar } from './barByBar'
import { cutAt } from './cut'
import { toEvents } from './events'
import { lightNotes } from './lights'
import { answerLists, transpile } from './lists'
import { madeFrom } from './madeFrom'
import { marksField, setMarks, type BlockMark } from './marks'
import { maskSliders } from './mask'
import { useOwnWorklets } from './ownWorklets'
import { SOUND_DRAG, type RawSound } from '../sounds/catalog'
import { addOwnSound, kitNames, loadModules, loadSamples, removeOwnSound, soundTaken } from './prebake'
import { createReplay } from './replay'
import { createSync, heard, syncSlot, type Sync } from './sync'
import { registerTheme } from './theme'
import { startTicking, stopTicking } from './ticker'
import { restedOn, restUnpluggedWorklets } from './unplug'

// A number as a slider in the code holds it.
const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/i

export type { BlockMark } from './marks'

export type EvalError = { message: string; line: number | null; guard?: boolean }
export type Rendered = { channels: Float32Array[]; sampleRate: number; secondsPerBar: number; missed: number }
// `only` names one pattern to make the recording of. The others are left out of it, but what
// they do to it stays: a pattern that is pushed down by the kick is still pushed down.
// `from` is the bar the recording starts at when that is not the first one, and `bars` is
// still the bar of the song it ends before.
export type RenderRequest = { bars: number; from?: number; ringSeconds: number; sampleRate: number; only?: string }
export type Moved = { k: 'play'; at: number } | { k: 'pause'; at: number } | { k: 'stop' }

export type EngineState = {
    playing: boolean
    paused: boolean
    dirty: boolean
    error: EvalError | null
    sounds: 'loading' | 'ready' | 'failed'
}

export interface Engine {
    mount(root: HTMLElement, initialCode: string): Promise<void>
    getCode(): string
    setCode(code: string): void
    applyEdit(edit: TextEdit | TextEdit[]): void
    undo(): boolean
    redo(): boolean
    selectAll(): void
    moveSlider(from: number, text: string): boolean
    evaluate(): Promise<void>
    refresh(): Promise<void>
    replay(held?: boolean): void
    replayHeld(): void
    comeInAt(bar: number): void
    pause(): void
    stop(): void
    setSolo(ids: string[]): void
    now(): number
    bpm(): number
    events(id: string, cycle: number, everyBar?: boolean): PatternEvent[]
    inStep(): boolean
    setStart(bar: number): void
    setEnd(bar: number | null): void
    setLoop(range: { from: number; to: number } | null): void
    render(request: RenderRequest, onProgress?: (done: number) => void): Promise<Rendered>
    audible(cycle: number): PatternEvent[]
    waveform(): Float32Array | null
    setMix(mix: Mix): void
    mix(): Mix
    levels(): [number, number] | null
    miniEvents(text: string, cycles: number): { start: number; length: number; value: unknown }[][] | null
    soundNames(bank: string | null): string[]
    preview(sound: string, bank: string | null, cutAfter?: number): void
    previewPart(sound: string, begin: number, end: number, seconds: number): void
    addSound(name: string, url: string): Promise<void>
    removeSound(name: string): void
    soundTaken(name: string): boolean
    audioLength(bytes: ArrayBuffer): Promise<number | null>
    decodeAudio(bytes: ArrayBuffer, sampleRate?: number): Promise<{ channels: Float32Array[]; sampleRate: number } | null>
    setLive(on: boolean): void
    setGuard(on: boolean): void
    playAt(position: number): void
    pauseAt(position: number): void
    startSync(version: number, by: string, send: (version: number, updates: SentUpdate[]) => void): void
    stopSync(): void
    receive(updates: SentUpdate[]): void
    // How many of the jam's changes are in the code here, in the relay's count.
    syncVersion(): number
    previewNote(midi: number, sound: string | null, seconds?: number): void
    sounds(): RawSound[]
    kitNames(): string[]
    markBlocks(marks: BlockMark[]): void
    reveal(offset: number): void
    onCodeChange(fn: (code: string, remote: boolean) => void): void
    onMoved(fn: (event: Moved) => void): void
    onState(fn: (state: EngineState) => void): void
    onCursor(fn: (offset: number) => void): void
    onSoundDrop(fn: (offset: number, name: string) => void): void
    onEvaluated(fn: () => void): void
}

const bareId = (id: string) => id.replace(/^_+|_+$/g, '')
const sameGesture = Annotation.define<boolean>()
const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))
const SETTLE = 300
// A song with distortion or crush has a few dozen worklet nodes made every second, and WebKit
// gives back what they took only when their audio clock is closed. After this many, a song
// that is stopped gets a new clock. What still rings when a song stops has this long to ring out.
const MANY_NODES = 20000
const RUNG_OUT = 5000
const STRETCH = 2
const LEAD = 0.05
// How many bars before its start a recording that starts later in the song is made from.
const RUN_UP = 2
// The clock of such a recording starts on a multiple of this many seconds of the song. That is
// a whole number of the stretches sounds are handed over in and, at the rates a file is made
// at, of the blocks of samples the clock works in. So every sound is handed over as long before
// it starts, and falls on the same sample of the same block, as in a recording from the first
// bar, and comes out the same.
const START_ON = 32
// Where the limiter of the desk begins to hold back, in decibels, and how hard.
const LIMIT_AT = -2
const LIMIT_BY = 20
const BEFORE_MASK = '__weftBeforeMask'
const STRUDELS_OWN = '__weftStrudelsOwn'

function toEvalError(err: unknown): EvalError {
    const e = err as { message?: string; loc?: { line?: number }; guard?: boolean }
    return {
        message: String(e?.message ?? err).replace(/\s*\(\d+:\d+\)$/, ''),
        line: typeof e?.loc?.line === 'number' ? e.loc.line : null,
        ...(e?.guard ? { guard: true } : {}),
    }
}

// Strudel keeps some of the parts a sound is built from, to use them again, and does not ask
// which audio clock a part belongs to. A song is made into a file on a clock of its own, so
// without this a part of the one clock would be handed to a sound on the other, and that sound
// would fail. Strudel holds the kept parts weakly; a part of another clock is reported as gone.
function keepPartsToTheirClock() {
    const Weak = globalThis.WeakRef
    globalThis.WeakRef = class<T extends WeakKey> extends Weak<T> {
        deref(): T | undefined {
            const held = super.deref()
            return held instanceof AudioNode && held.context !== getAudioContext() ? undefined : held
        }
    } as typeof WeakRef
}

// Strudel says of any two of the pictures it draws in the code, a scope or a piano roll, that
// they are one and the same. The editor then keeps one of them and loses the others, and the
// lines between them with them. Two are the same when they are the same kind and the same one
// in the count.
function tellPicturesApart() {
    type Picture = { widgetConfig?: { type?: string; index?: number } }
    BlockWidget.prototype.eq = function (this: Picture, other: Picture) {
        return other?.widgetConfig?.type === this.widgetConfig?.type && other?.widgetConfig?.index === this.widgetConfig?.index
    }
}

export function createEngine(): Engine {
    restUnpluggedWorklets()
    useOwnWorklets()
    keepPartsToTheirClock()
    tellPicturesApart()
    let mirror: any = null
    let state: EngineState = { playing: false, paused: false, dirty: false, error: null, sounds: 'loading' }
    let registry = new Map<string, any>()
    let pending = new Map<string, any>()
    let unmasked = new Map<string, any>()
    let pendingUnmasked = new Map<string, any>()
    // The patterns that sounded when the code was last evaluated: not muted, not left out by a solo.
    let sounding = new Set<string>()
    let pendingSounding = new Set<string>()
    // The bar a scene comes in on. It is said once, for the evaluation that follows.
    let comeIn: number | null = null
    let startBar = 0
    let endBar: number | null = null
    let liveMode = false
    // Bars that go round: from `from` up to, not including, `to`. While they do, `offset` is how
    // far into them the song was started.
    let loop: { from: number; to: number } | null = null
    const span = () => (loop ? loop.to - loop.from : 1)
    const around = (cycles: number) => ((cycles % span()) + span()) % span()
    let offset = 0
    // Strudel's own pause plays everything it missed at once when it goes on. Pausing here is
    // stopping while remembering where the song was, and going on is starting from there.
    let resumeAt: number | null = null
    let baseExtensions: unknown = null
    let evaluatedCode: string | null = null
    let dress: () => void = () => undefined
    let soloIds: string[] = []
    // The sounds that push others down, bar by bar, as the last recording was answered them.
    // A recording of one pattern needs nothing else from the rest of the song, so one that
    // follows a recording of the same song does not ask the whole song again.
    let ducking: { code: string; cps: number; bars: number; byBar: any[][] } | null = null
    let evaluated = false
    let lastCode = ''
    let mix: Mix = DEFAULT_MIX
    let gesture = 0
    let editedIn = -1
    // The editor only joins changes made within half a second of each other, and a press can
    // rest for longer than that. Every change of a press is given the time of its first.
    let editedAt = 0
    const step = () => {
        const joins = gesture === editedIn
        editedIn = gesture
        if (!joins) editedAt = Date.now()
        return [joins ? sameGesture.of(true) : isolateHistory.of('before'), Transaction.time.of(editedAt)]
    }
    // Everything Strudel plays comes together in one place. Between there and the speakers
    // stands the desk: three tone controls, the pan, a limiter that is in the way or not, and
    // the volume last. What is heard is measured after it, whole for the waveform and each side
    // for the meters. Measuring there, and not by marking every sound, leaves a scope in the
    // code the mark it puts on its own pattern. A song rendered to a file does not pass the desk.
    type Desk = {
        of: AudioNode
        low: BiquadFilterNode
        mid: BiquadFilterNode
        high: BiquadFilterNode
        pan: StereoPannerNode
        limiter: DynamicsCompressorNode
        out: GainNode
        wave: AnalyserNode
        sides: [AnalyserNode, AnalyserNode]
        heard: Float32Array<ArrayBuffer>
        side: Float32Array<ArrayBuffer>
        limited: boolean | null
    }
    let desk: Desk | null = null
    const deskNow = (): Desk | null => {
        const output: AudioNode | null = getSuperdoughAudioController().output.destinationGain
        if (!output || output.context instanceof OfflineAudioContext) return null
        if (desk?.of === output) return desk
        const context = output.context
        const tone = (type: BiquadFilterType, hertz: number) => {
            const node = context.createBiquadFilter()
            node.type = type
            node.frequency.value = hertz
            return node
        }
        const low = tone('lowshelf', 120)
        const mid = tone('peaking', 1000)
        mid.Q.value = 0.9
        const high = tone('highshelf', 6000)
        const pan = context.createStereoPanner()
        const limiter = context.createDynamicsCompressor()
        limiter.threshold.value = LIMIT_AT
        limiter.knee.value = 0
        limiter.ratio.value = LIMIT_BY
        limiter.attack.value = 0.002
        limiter.release.value = 0.2
        // A limiter of this kind makes everything a little louder by itself. That is taken back.
        const even = context.createGain()
        even.gain.value = Math.pow(Math.pow(10, (LIMIT_AT - LIMIT_AT / LIMIT_BY) / 20), 0.6)
        const out = context.createGain()
        const wave = context.createAnalyser()
        wave.fftSize = 2048
        const split = context.createChannelSplitter(2)
        const side = () => {
            const node = context.createAnalyser()
            node.fftSize = 1024
            return node
        }
        const sides: [AnalyserNode, AnalyserNode] = [side(), side()]
        output.disconnect()
        output.connect(low)
        low.connect(mid)
        mid.connect(high)
        high.connect(pan)
        limiter.connect(even)
        even.connect(out)
        out.connect(context.destination)
        out.connect(wave)
        out.connect(split)
        split.connect(sides[0], 0)
        split.connect(sides[1], 1)
        desk = { of: output, low, mid, high, pan, limiter, out, wave, sides, heard: new Float32Array(wave.fftSize), side: new Float32Array(sides[0].fftSize), limited: null }
        return desk
    }
    const applyMix = () => {
        try {
            const now = deskNow()
            if (!now) return
            const at = now.out.context.currentTime
            const ease = (param: AudioParam, value: number) => param.setTargetAtTime(value, at, 0.015)
            ease(now.out.gain, mix.volume)
            ease(now.pan.pan, mix.pan)
            ease(now.low.gain, mix.low)
            ease(now.mid.gain, mix.mid)
            ease(now.high.gain, mix.high)
            if (now.limited !== mix.limit) {
                now.pan.disconnect()
                now.pan.connect(mix.limit ? now.limiter : now.out)
                now.limited = mix.limit
            }
        } catch {
            return
        }
    }
    const wholeSound = (): Float32Array | null => {
        const now = deskNow()
        if (!now) return null
        now.wave.getFloatTimeDomainData(now.heard)
        return now.heard
    }
    // The loudest moment of each side in the last instant, 1 being as loud as a machine plays
    // without distorting.
    const sidesNow = (): [number, number] | null => {
        const now = deskNow()
        if (!now) return null
        return now.sides.map((side) => {
            side.getFloatTimeDomainData(now.side)
            let most = 0
            for (let at = 0; at < now.side.length; at++) most = Math.max(most, Math.abs(now.side[at]))
            return most
        }) as [number, number]
    }
    const stateFns = new Set<(state: EngineState) => void>()
    const codeFns = new Set<(code: string, remote: boolean) => void>()
    const movedFns = new Set<(event: Moved) => void>()
    const moved = (event: Moved) => movedFns.forEach((fn) => fn(event))
    // In a jam the code is shared with one other person. `receiving` is true for as long as a
    // change of theirs is being put into the code.
    let sync: Sync | null = null
    let receiving = false
    // A song that came from someone else is only played when all of it is music code. Every
    // way of playing code goes through the one step that Strudel is handed to prepare it, so
    // that is where a song is checked.
    // A song is taken to be from someone else until it is said to be yours.
    let guarded = true
    // One sound of Strudel's takes text and runs it as code inside the sound engine. The check
    // refuses the names that lead there; this is the same refusal at the last step before a
    // sound is made, whatever road the value took.
    const carriesCode = (value: any): boolean =>
        Boolean(value) && typeof value === 'object' && ('byteBeatExpression' in value || 'byteBeatStartTime' in value || String(value.s ?? '').trim().toLowerCase().startsWith('bytebeat'))
    const prepare = (code: string, options: unknown) => {
        const refused = guarded ? checkSong(code) : null
        if (refused) throw Object.assign(new Error(refused.what), { loc: { line: refused.line }, guard: true })
        return transpile(code, options)
    }
    const cursorFns = new Set<(offset: number) => void>()
    const dropFns = new Set<(offset: number, name: string) => void>()
    const evaluatedFns = new Set<() => void>()

    const setState = (patch: Partial<EngineState>) => {
        state = { ...state, ...patch }
        stateFns.forEach((fn) => fn(state))
    }

    // Where a song that is not playing starts: in the bars that go round when there are some.
    const startingAt = () => {
        if (liveMode) return 0
        if (!loop) return resumeAt ?? startBar
        const at = resumeAt ?? loop.from
        return at >= loop.from && at < loop.to ? at - loop.from : 0
    }

    const wrapRegistration = () => {
        // Two evaluations that overlap find each other's wrapper here. Wrapping that one would
        // move every pattern twice, so what is wrapped is always Strudel's own.
        const original = Pattern.prototype.p[STRUDELS_OWN] ?? Pattern.prototype.p
        let anonymous = 0
        pending = new Map()
        pendingUnmasked = new Map()
        pendingSounding = new Set()
        // A scene that is chosen while the song plays comes in on a bar. Strudel takes the notes
        // of the next third of a second at a time, so the code is evaluated that long before the
        // bar, and each pattern the scene switches is cut at the bar: one it switches off plays
        // on until there, one it switches on rests until there.
        const bar = liveMode && state.playing ? comeIn : null
        const sounded = sounding
        comeIn = null
        // Two patterns can have one name, so a pattern that sounded is known by its name and by
        // which one of that name it is.
        const named = new Map<string, number>()
        Pattern.prototype.p = function (this: any, id: unknown) {
            if (typeof id !== 'string') return original.call(this, id)
            const bare = bareId(id)
            const key = bare.includes('$') ? `pattern ${++anonymous}` : bare
            const nth = (named.get(key) ?? 0) + 1
            named.set(key, nth)
            const place = `${key} ${nth}`
            pending.set(key, this)
            pendingUnmasked.set(key, this[BEFORE_MASK] ?? this)
            if (soloIds.length && !soloIds.includes(key)) return silence
            const muted = id !== bare
            if (!muted) pendingSounding.add(place)
            // Strudel looks a little ahead, so the bar after the last one would already have
            // started to sound by the time the song is stopped at its end. Nothing that starts
            // at or after the end is let through. The end is read as it is now, not as it was
            // when the code was evaluated, because the song grows and shrinks as it is arranged.
            const shift = offset
            if (liveMode) {
                const whole = this[BEFORE_MASK] ?? this
                // Strudel takes a name that starts with a capital S as solo, and leaves the
                // other patterns out for as long as it is handed that name, also where the
                // pattern itself is cut to silence. Such a pattern is switched the moment the
                // code is evaluated, not on the bar.
                const takenAsSolo = bare.length > 1 && bare.startsWith('S')
                const switched = bar !== null && !takenAsSolo && muted === sounded.has(place)
                const round = switched ? new Pattern(cutAt((asked: unknown) => whole.query(asked), bar, muted ? 'before' : 'from')) : whole
                // Strudel plays nothing under a muted name, so a pattern that is switched off
                // is handed over under its bare one.
                return original.call(shift ? round.early(shift) : round, switched ? bare : id)
            }
            if (loop) return original.call(this.ribbon(loop.from, loop.to - loop.from).early(shift), id)
            const within = (hap: any) => endBar === null || (hap.whole ?? hap.part).begin.valueOf() + shift < endBar
            return original.call((shift ? this.early(shift) : this).filterHaps(within), id)
        }
        Pattern.prototype.p[STRUDELS_OWN] = original
    }

    // The bars a pattern plays in are written as a mask at the end of it. A strip still has to
    // draw the pattern in the bars where it rests, so the pattern as it was before its last mask
    // is kept beside the one that plays. Strudel sets up mask once, so it is wrapped once.
    const keepUnmasked = () => {
        const original = Pattern.prototype.mask
        Pattern.prototype.mask = function (this: any, ...args: unknown[]) {
            const masked = original.apply(this, args)
            masked[BEFORE_MASK] = this
            return masked
        }
    }

    // Strudel drops a hit whose sample is still loading when it falls due. If that happened, the
    // sample is in memory by the time the call returns, so a second try is heard. Each try gets
    // its own value object because Strudel rewrites the one it is given.
    // WebKit leaves the audio clock stopped until it is told to run from inside a click or a
    // key press, and Strudel never tells it. A sound that starts usually wakes it, but a song
    // whose first bars are silent has none, and then the song would stand still.
    const wakeAudio = () => {
        try {
            const context = getAudioContext()
            if (context.state !== 'running') void context.resume()
        } catch {
            return
        }
    }

    // A sound that ducks a mixing channel can only duck one that exists, and Strudel makes a
    // channel when the first sound is played on it. The kick that opens a song would find none
    // and duck nothing, so the channel is made before a sound that ducks it is played.
    const readyToDuck = (value: any) => {
        const target = value?.duckorbit
        if (target === undefined || target === null) return
        try {
            for (const channel of String(target).split(':').map(Number)) {
                if (Number.isFinite(channel)) getSuperdoughAudioController().getOrbit(channel)
            }
        } catch {
            return
        }
    }

    // Strudel ducks a channel from a timer that asks what time it is when it goes off, a moment
    // before the sound. On the clock a file is made on, time runs as fast as the machine can,
    // so that moment has no meaning there and the ducking would land anywhere. For a file the
    // same drop and rise are written onto the channel's level at the time of the sound itself.
    const first = (value: unknown, usual: number) => {
        const number = Number(String(value ?? '').split(':')[0])
        return value !== undefined && value !== null && Number.isFinite(number) ? number : usual
    }
    const duckAt = (value: any, time: number) => {
        const low = Math.min(1, Math.max(0.01, 1 - Math.sqrt(first(value.duckdepth, 1))))
        const drop = time + first(value.duckonset, 0)
        const back = drop + Math.max(first(value.duckattack, 0.1), 0.002)
        for (const channel of String(value.duckorbit).split(':').map(Number)) {
            if (!Number.isFinite(channel)) continue
            const level = getSuperdoughAudioController().getOrbit(channel).output.gain
            level.cancelScheduledValues(drop)
            level.setValueAtTime(low, drop)
            level.exponentialRampToValueAtTime(1, back)
        }
    }

    // The new clock is made inside the press that stops the song, because only there is a clock
    // allowed to start by itself. It takes over a little later, if the song is still stopped
    // then, and the old clock is closed with all it held. Whatever goes wrong, the old one stays.
    let spare: AudioContext | null = null
    let spareTimer = 0
    let renewing: Promise<void> | null = null
    const dropSpare = () => {
        window.clearTimeout(spareTimer)
        void spare?.close().catch(() => undefined)
        spare = null
    }
    const renew = async () => {
        const next = spare
        spare = null
        const old = getAudioContext()
        if (!next) return
        if (state.playing || state.paused || next.state !== 'running' || old instanceof OfflineAudioContext) return void next.close().catch(() => undefined)
        const controller = getSuperdoughAudioController()
        try {
            setAudioContext(next)
            setSuperdoughAudioController(null)
            await initAudio()
            applyMix()
            void old.close().catch(() => undefined)
        } catch {
            setAudioContext(old)
            setSuperdoughAudioController(controller)
            void next.close().catch(() => undefined)
        }
    }
    const renewLater = () => {
        window.clearTimeout(spareTimer)
        spareTimer = window.setTimeout(() => (renewing = renew().finally(() => (renewing = null))), RUNG_OUT)
    }
    const renewSoon = () => {
        if (spare || renewing) return
        const old = getAudioContext()
        if (old instanceof OfflineAudioContext || !navigator.userActivation?.isActive || restedOn(old) < MANY_NODES) return
        try {
            spare = new AudioContext({ sampleRate: old.sampleRate })
        } catch {
            return
        }
        renewLater()
    }

    const audition = (make: () => Record<string, unknown>, seconds: number) => {
        wakeAudio()
        // A sound that is tried out is not cut off by the clock being changed under it.
        if (spare) renewLater()
        const fire = async () => {
            const due = getAudioContext().currentTime + 0.05
            await superdough(make(), due, seconds)
            return getAudioContext().currentTime > due
        }
        fire()
            .then((missed) => (missed ? fire() : false))
            .catch(() => undefined)
    }

    // Strudel keeps time on the same thread as everything else and looks only a tenth of a second
    // ahead, so a long stretch of work is heard as a gap. What the screen does after an
    // evaluation is therefore left for a turn of its own, after the evaluation has returned.
    let announced = 0
    const announce = () => {
        window.clearTimeout(announced)
        announced = window.setTimeout(() => evaluatedFns.forEach((fn) => fn()), 0)
    }

    // The code is evaluated in a turn of its own as well, after the screen has followed the
    // change. Everything that asks for it in the same turn is answered by one evaluation: a
    // change to the code, a bar to start from, bars to go round, a solo.
    const { replay, replayHeld, dropReplay, replayWaits } = createReplay(() => void (state.playing ? engine.evaluate() : engine.refresh()))

    // Strudel throws when it is given no code at all, so an empty song is handled here:
    // nothing plays, nothing is registered and there is no error to show.
    const blank = () => !String(mirror?.code ?? lastCode).trim()
    const silence = () => {
        mirror.stop()
        registry = new Map()
        unmasked = new Map()
        sounding = new Set()
        evaluated = false
        evaluatedCode = null
        resumeAt = null
        if (state.paused) setState({ paused: false })
        setState({ error: null, dirty: false })
        announce()
    }

    // A slider in the code changes the sound as it is dragged, without the code being evaluated
    // again, because Strudel is told the new number directly. When the other person drags one,
    // only the number in the code arrives, so Strudel is told here. The editor only draws the
    // sliders of the lines that are in sight, so all the sliders it knows of are gone through,
    // drawn or not.
    const followSliders = () => {
        type Drawn = HTMLInputElement & { originalValue: string }
        type Known = { originalFrom: number; value: string; slider?: Drawn }
        const doc = mirror.editor.state.doc
        const known = mirror.editor.plugin(sliderPlugin)?.decorations.iter()
        for (; known?.value; known.next()) {
            const widget: Known | undefined = known.value.widget
            const text = NUMBER.exec(doc.sliceString(known.from, known.from + 32))?.[0]
            if (!widget || text === undefined || text === (widget.slider ? widget.slider.originalValue : widget.value)) continue
            // One that is drawn later starts from what it is given here.
            widget.value = text
            if (widget.slider) {
                widget.slider.originalValue = text
                widget.slider.value = text
            }
            window.postMessage({ type: 'cm-slider', value: Number(text), id: `slider_${widget.originalFrom}` })
        }
    }

    // The song made to sound as its code now reads, because the other person did so on theirs.
    // Where it already does, and no error is showing, there is nothing to answer.
    const reevaluate = async () => {
        if (!mirror) return
        if (blank()) return silence()
        if (evaluatedCode === mirror.code && !state.error) return
        if (!state.playing) offset = startingAt()
        await mirror.repl.evaluate(mirror.code, false)
    }
    // That is done in a turn of its own, as the code reads when word of it comes. What arrives
    // before it is done was changed after they made the song sound, and may be a line that is
    // half typed. It is kept, and taken in after, in a turn of its own.
    // A change of your own may still be waiting to be played when the word comes. The song is
    // then played again the way that change would have had it played, which tells them. Answered
    // by itself, the change would sound here without being said, and the other would never hear it.
    let reheard = 0
    const kept: SentUpdate[][] = []
    const take = (updates: SentUpdate[]) => {
        if (!sync) return
        receiving = true
        try {
            sync.receive(mirror.editor, updates)
        } finally {
            receiving = false
        }
    }
    const takeKept = () => {
        while (kept.length && !reheard) take(kept.shift()!)
    }
    const hearSoon = () => {
        window.clearTimeout(reheard)
        reheard = window.setTimeout(() => {
            reheard = 0
            if (replayWaits()) replay()
            else void reevaluate()
            window.setTimeout(takeKept, 0)
        }, 0)
    }

    // A control writes a whole value again: all the steps of a row, all the notes of a roll. Only
    // what differs from what stands there is changed in the code, so that two people who change
    // different steps of the same row at once both get their step.
    const tighten = (edit: TextEdit): TextEdit | null => {
        const old: string = mirror.editor.state.doc.sliceString(edit.from, edit.to)
        const most = Math.min(old.length, edit.insert.length)
        let head = 0
        while (head < most && old[head] === edit.insert[head]) head++
        let tail = 0
        while (tail < most - head && old[old.length - 1 - tail] === edit.insert[edit.insert.length - 1 - tail]) tail++
        if (head === old.length && head === edit.insert.length) return null
        return { from: edit.from + head, to: edit.to - tail, insert: edit.insert.slice(head, edit.insert.length - tail) }
    }

    const sayHeard = () => {
        if (sync && evaluatedCode !== mirror.code) mirror.editor.dispatch({ effects: heard.of(null) })
    }

    const query = (pattern: any, cycle: number): PatternEvent[] => {
        if (!pattern) return []
        try {
            return toEvents(pattern.queryArc(cycle, cycle + 1), cycle)
        } catch {
            return []
        }
    }

    // A note that is handed over to be played is also one to light in the code.
    let toLight: (hap: any) => void = () => undefined
    const makeMirror = (root: HTMLElement, initialCode: string) =>
        new StrudelMirror({
            defaultOutput: (hap: any, deadline: number, duration: number, cps: number, time: number) => {
                toLight(hap)
                if (guarded && carriesCode(hap.value)) return
                readyToDuck(hap.value)
                return webaudioOutput(hap, deadline, duration, cps, time)
            },
            getTime: () => getAudioContext().currentTime,
            setInterval: startTicking,
            clearInterval: stopTicking,
            transpiler: prepare,
            root,
            initialCode,
            drawTime: [0, 0],
            bgFill: false,
            solo: false,
            prebake: loadModules,
            beforeEval: wrapRegistration,
            afterEval: (done: { code?: string }) => {
                applyMix()
                registry = pending
                unmasked = pendingUnmasked
                sounding = pendingSounding
                evaluated = true
                evaluatedCode = done?.code ?? mirror.code
                setState({ error: null, dirty: false })
                announce()
            },
            onEvalError: (err: unknown) => setState({ error: toEvalError(err) }),
            onUpdateState: (s: { started?: boolean; activeCode?: string }) => {
                const code: string = mirror?.code ?? lastCode
                if (code !== lastCode) {
                    lastCode = code
                    codeFns.forEach((fn) => fn(code, receiving))
                }
                const playing = Boolean(s.started)
                const dirty = evaluated && maskSliders(code) !== maskSliders(s.activeCode ?? '')
                if (playing !== state.playing || dirty !== state.dirty) setState({ playing, dirty })
            },
        })

    const engine: Engine = {
        async mount(root, initialCode) {
            window.addEventListener('pointerdown', () => gesture++, true)
            window.addEventListener('keydown', () => gesture++, true)
            registerTheme()
            initAudioOnFirstClick()
            lastCode = initialCode
            // A song that is opened needs an editor with no undo steps from the song before it,
            // and the only way to get one is a fresh state. Strudel does not hand out the list
            // it builds its editor from, so it is taken as the editor is made.
            const create = EditorState.create
            ;(EditorState as any).create = (config: { extensions?: unknown }) => {
                baseExtensions = config?.extensions
                return create.call(EditorState, config as never)
            }
            try {
                mirror = makeMirror(root, initialCode)
            } finally {
                ;(EditorState as any).create = create
            }
            toLight = lightNotes(mirror, root)

            dress = () => {
                mirror.updateSettings({
                    ...codemirrorSettings.get(),
                    theme: 'weft',
                    fontFamily: "'Martian Mono Variable', ui-monospace, Menlo, monospace",
                    fontSize: 12.5,
                    keybindings: 'codemirror',
                    isLineNumbersDisplayed: true,
                    isActiveLineHighlighted: false,
                    isPatternHighlightingEnabled: true,
                    isFlashEnabled: true,
                    isLineWrappingEnabled: false,
                    isBracketMatchingEnabled: false,
                    isBracketClosingEnabled: true,
                    isAutoCompletionEnabled: true,
                    isTooltipEnabled: false,
                    isTabIndentationEnabled: false,
                    isMultiCursorEnabled: false,
                })
                mirror.editor.dispatch({
                    effects: StateEffect.appendConfig.of([
                        history({ joinToEvent: (tr) => tr.annotation(sameGesture) === true }),
                        marksField,
                        syncSlot.of([]),
                        // What the editor offers while typing is drawn over the whole window,
                        // so that the code pane does not cut off the half of it that says what
                        // an offer does.
                        tooltips({ parent: document.body }),
                        Prec.highest(
                            keymap.of([
                                { key: 'Mod-Enter', run: () => (void engine.evaluate(), true) },
                                { key: 'Mod-.', run: () => (engine.stop(), true) },
                            ]),
                        ),
                        EditorView.updateListener.of((update) => {
                            if (update.selectionSet) cursorFns.forEach((fn) => fn(update.state.selection.main.head))
                        }),
                        // A sound dragged in from the browser is not put in as text by the
                        // editor. Where it was let go is handed on, and what happens there is
                        // decided by who knows the song.
                        EditorView.domEventHandlers({
                            dragover(event) {
                                if (!event.dataTransfer?.types.includes(SOUND_DRAG)) return false
                                event.preventDefault()
                                event.dataTransfer.dropEffect = 'copy'
                                return true
                            },
                            drop(event, view) {
                                const name = event.dataTransfer?.getData(SOUND_DRAG)
                                if (!name) return false
                                event.preventDefault()
                                const offset = view.posAtCoords({ x: event.clientX, y: event.clientY }, false)
                                dropFns.forEach((fn) => fn(offset, name))
                                view.focus()
                                return true
                            },
                        }),
                    ]),
                })
            }
            dress()
            loadSamples().then(
                () => setState({ sounds: 'ready' }),
                () => setState({ sounds: 'failed' }),
            )
            await mirror.prebaked
            keepUnmasked()
            answerLists()
            if (!blank()) await mirror.repl.evaluate(mirror.code, false)
        },
        getCode: () => mirror?.code ?? lastCode,
        setCode(code) {
            if (baseExtensions) {
                mirror.editor.setState(EditorState.create({ doc: code, extensions: baseExtensions as never }))
                dress()
            } else {
                mirror.editor.dispatch({ changes: { from: 0, to: mirror.editor.state.doc.length, insert: code } })
            }
            mirror.code = code
            mirror.repl.setCode?.(code)
            lastCode = code
            codeFns.forEach((fn) => fn(code, false))
        },
        // What one press of the pointer or of a key changes is one step to undo, however many
        // changes it makes: a knob that is dragged, a note that is moved, bars that are painted.
        // The next press starts a new step, also when it follows at once.
        applyEdit(edit) {
            const changes = (Array.isArray(edit) ? [...edit].sort((a, b) => a.from - b.from) : [edit]).flatMap((one) => tighten(one) ?? [])
            if (changes.length) mirror.editor.dispatch({ changes, annotations: step() })
        },
        selectAll() {
            mirror.editor.dispatch({ selection: { anchor: 0, head: mirror.editor.state.doc.length } })
            mirror.editor.focus()
        },
        // Every change a control makes is a change to the code, so the editor's own memory of
        // changes is the one memory there is, whatever made the change.
        undo: () => undo(mirror.editor),
        redo: () => redo(mirror.editor),
        // A slider in the code changes what is heard without the code being played again. The
        // editor only draws the sliders of the lines that are in sight, so the one that is meant
        // is looked for among all the sliders it knows of, drawn or not.
        moveSlider(from, text) {
            type Drawn = HTMLInputElement & { originalValue: string }
            type Known = { originalFrom: number; value: string; slider?: Drawn }
            let meant: Known | undefined
            mirror.editor.plugin(sliderPlugin)?.decorations.between(from, from, (at: number, _to: number, mark: { widget?: Known }) => {
                if (at === from && mark.widget) meant = mark.widget
            })
            const now = meant && NUMBER.exec(mirror.editor.state.sliceDoc(from, from + 32))?.[0]
            if (!meant || !now) return false
            const changes = tighten({ from, to: from + now.length, insert: text })
            if (changes) mirror.editor.dispatch({ changes, annotations: step() })
            // One that is drawn later starts from what it is given here.
            meant.value = text
            if (meant.slider) {
                meant.slider.originalValue = text
                meant.slider.value = text
            }
            window.postMessage({ type: 'cm-slider', value: Number(text), id: `slider_${meant.originalFrom}` })
            return true
        },
        async evaluate() {
            dropSpare()
            if (renewing) await renewing
            // Whatever was waiting to be played again is played by this.
            dropReplay()
            wakeAudio()
            if (blank()) return silence()
            if (!state.playing) {
                offset = startingAt()
                moved({ k: 'play', at: liveMode ? 0 : loop ? loop.from + offset : offset })
            }
            resumeAt = null
            if (state.paused) setState({ paused: false })
            sayHeard()
            await mirror.evaluate(true)
        },
        async refresh() {
            if (blank()) return silence()
            if (!state.playing) offset = startingAt()
            sayHeard()
            await mirror.repl.evaluate(mirror.code, false)
        },
        replay,
        replayHeld,
        comeInAt(bar) {
            comeIn = bar
        },
        pause() {
            if (!state.playing) return
            const at = engine.now()
            resumeAt = at
            setState({ paused: true })
            mirror.stop()
            moved({ k: 'pause', at })
        },
        // In a jam the other's song is already somewhere when yours starts, or is found to have
        // run a little ahead while both play. Either way yours is put where theirs is.
        playAt(position) {
            dropSpare()
            wakeAudio()
            if (!mirror || blank()) return
            resumeAt = null
            if (state.paused) setState({ paused: false })
            const counted = state.playing ? mirror.repl.scheduler.now() : 0
            offset = (loop && !liveMode ? position - loop.from : position) - counted
            void mirror.evaluate(true)
        },
        pauseAt(position) {
            resumeAt = position
            if (!state.paused) setState({ paused: true })
            if (state.playing) mirror.stop()
        },
        startSync(version, by, send) {
            sync = createSync(mirror.editor.state.doc, version, by, send, {
                changed: followSliders,
                heard: hearSoon,
            })
            mirror.editor.dispatch({ effects: syncSlot.reconfigure(sync.extension) })
        },
        stopSync() {
            if (!sync) return
            sync = null
            kept.length = 0
            mirror.editor.dispatch({ effects: syncSlot.reconfigure([]) })
        },
        // What is kept has arrived and goes into the code before anything that comes after it,
        // so it counts.
        syncVersion: () => (sync ? sync.version(mirror.editor) + kept.reduce((sum, updates) => sum + updates.length, 0) : 0),
        receive(updates) {
            if (reheard || kept.length) return void kept.push(updates)
            take(updates)
        },
        // Strudel always starts counting cycles at nought, so playing from another bar is done
        // by moving every pattern earlier. While it plays, the same move makes the song jump.
        setStart(bar) {
            startBar = bar
            resumeAt = null
            if (state.paused) setState({ paused: false })
            if (!state.playing || blank() || liveMode) return
            offset = bar - Math.floor(mirror.repl.scheduler.now())
            replay()
        },
        setEnd(bar) {
            endBar = bar
        },
        // Setting bars to go round while the song plays jumps to the first of them; taking them
        // away lets the song go on from where it is.
        setLoop(range) {
            const at = engine.now()
            loop = range
            resumeAt = null
            if (state.paused) setState({ paused: false })
            if (!state.playing || blank() || liveMode) return
            const counted = mirror.repl.scheduler.now()
            offset = range ? -Math.floor(counted) : Math.floor(at) - Math.floor(counted)
            replay()
        },
        // The song as a recording, made faster than it plays: every sound of the song is
        // handed to an audio clock that is not the one you listen on, and that clock then runs
        // through the song as fast as the machine can. The song is evaluated from its first
        // bar for this, with nothing soloed, and put back as it was afterwards. For a recording
        // that starts at a later bar the song is not moved: it is asked at its real bars, so
        // that whatever goes by the bar is as it is there, and only the clock starts later.
        async render({ bars, from = 0, ringSeconds, sampleRate, only }, onProgress) {
            if (blank()) throw new Error('There is nothing in this song to play.')
            engine.stop()
            dropSpare()
            if (renewing) await renewing
            const before = { soloIds, offset, endBar, loop, liveMode }
            const live = getAudioContext()
            const liveController = getSuperdoughAudioController()
            // Strudel tidies up after each sound with a timer that takes for granted there is
            // one audio clock, and fails when a sound ends while the other clock is the one in
            // use. So the clock you listen on is held still for as long as the other one is in
            // use, after a moment for what still rings, and the other one is given a moment to
            // finish tidying before the first is put back.
            // WebKit never answers when a clock that has not run yet is asked to stand still.
            const running = live.state === 'running'
            if (running) {
                await pause(SETTLE)
                await live.suspend().catch(() => undefined)
            }
            let missed = 0
            soloIds = []
            offset = 0
            endBar = bars
            loop = null
            liveMode = false
            try {
                const code: string = mirror.code
                await mirror.repl.evaluate(code, false)
                if (state.error) throw new Error(state.error.message)
                const pattern = mirror.repl.state.pattern
                const cps: number = mirror.repl.scheduler.cps
                const first = madeFrom(from, RUN_UP, (bar) => pattern.queryArc(bar, bar + 1, { _cps: cps }).flatMap((hap: any) => (hap.whole ? [hap.whole.begin.valueOf()] : [])))
                const zero = Math.floor(first / cps / START_ON) * START_ON
                // Nothing sounds on the clock before the bar the recording is made from, and
                // that takes no time to make, so it does not count in how far along it is.
                const silent = first / cps - zero
                const seconds = bars / cps - zero + ringSeconds
                const clock = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate)
                setAudioContext(clock)
                setSuperdoughAudioController(null)
                await initAudio()
                const startOf = (hap: any) => hap.whole.begin.valueOf() / cps - zero
                const ducks = (hap: any) => hap.value?.duckorbit !== undefined && hap.value?.duckorbit !== null
                const own = only === undefined ? null : pending.get(only)
                const known = ducking?.code === code && ducking.cps === cps && ducking.bars === bars ? ducking.byBar : []
                const found: any[][] = []
                // With one pattern asked for, the others are only there for what they do to it,
                // and the whole song is asked for that only where it is not known yet.
                const inBar = (bar: number): { hap: any; heard: boolean }[] => {
                    const hapsOf = (from: any): any[] => (from ? from.queryArc(bar, Math.min(bar + 1, bars), { _cps: cps }).filter((hap: any) => hap.hasOnset()) : [])
                    const kept: any[] | undefined = only === undefined ? undefined : known[bar]
                    const everything = kept ? [] : hapsOf(pattern)
                    everything.forEach((hap: any) => hap.ensureObjectValue())
                    found[bar] = kept ?? everything.filter(ducks)
                    if (only === undefined) return everything.map((hap) => ({ hap, heard: true }))
                    return [...hapsOf(own).map((hap) => ({ hap, heard: true })), ...found[bar].map((hap) => ({ hap, heard: false }))]
                }
                const due = barByBar(bars - first, cps, (bar) => inBar(first + bar), (sound) => startOf(sound.hap))
                // The sounds are handed over a stretch at a time, a little before they are
                // due, with the clock standing still meanwhile, the way they arrive when the
                // song plays. Handing over the whole song at once makes the clock carry every
                // sound of it from the first moment, and it then runs slower than the song.
                const handOver = async (sounds: { hap: any; heard: boolean }[]) => {
                    for (const { hap, heard } of sounds) {
                        hap.ensureObjectValue()
                        if (guarded && carriesCode(hap.value)) continue
                        const { duckorbit, ...value } = hap.value
                        if (duckorbit !== undefined && duckorbit !== null && (only === undefined || !heard)) duckAt(hap.value, startOf(hap))
                        if (heard) await superdough(value, startOf(hap), hap.duration.valueOf() / cps, cps, hap.whole.begin.valueOf()).catch(() => void missed++)
                    }
                }
                await handOver(due(STRETCH))
                // A bar can answer something that is not a sound, and that ends the recording.
                // The clock cannot be stopped, so it runs to its end with nothing more handed
                // over, and the reason is given then.
                let failed = null as { why: unknown } | null
                for (let at = STRETCH - LEAD; at < seconds; at += STRETCH) {
                    void clock.suspend(at).then(async () => {
                        try {
                            const sounds = failed ? [] : due(at + LEAD + STRETCH)
                            await handOver(sounds).catch(() => undefined)
                        } catch (why) {
                            failed = { why }
                        }
                        onProgress?.(Math.max(0, at - silent) / (seconds - silent))
                        void clock.resume()
                    })
                }
                const buffer = await clock.startRendering()
                await pause(SETTLE)
                if (failed) throw failed.why
                ducking = { code, cps, bars, byBar: found }
                const early = Math.round((from / cps) * sampleRate) - zero * sampleRate
                return { channels: [buffer.getChannelData(0).subarray(early), buffer.getChannelData(1).subarray(early)], sampleRate, secondsPerBar: 1 / cps, missed }
            } finally {
                setAudioContext(live)
                setSuperdoughAudioController(liveController)
                soloIds = before.soloIds
                offset = before.offset
                endBar = before.endBar
                loop = before.loop
                liveMode = before.liveMode
                await mirror.repl.evaluate(mirror.code, false).catch(() => undefined)
                applyMix()
                if (running) void live.resume().catch(() => undefined)
            }
        },
        stop() {
            const was = state.playing || state.paused
            resumeAt = null
            if (state.paused) setState({ paused: false })
            mirror.stop()
            if (was) moved({ k: 'stop' })
            if (was) renewSoon()
        },
        setSolo(ids) {
            soloIds = ids
            if (state.playing) replay()
        },
        now: () => {
            if (liveMode) return mirror?.repl.scheduler.started ? mirror.repl.scheduler.now() + offset : (resumeAt ?? 0)
            if (!mirror?.repl.scheduler.started) return resumeAt ?? (loop ? loop.from : startBar)
            const counted = mirror.repl.scheduler.now() + offset
            return loop ? loop.from + around(counted) : counted
        },
        bpm: () => (mirror ? mirror.repl.scheduler.cps * 240 : 120),
        events: (id, cycle, everyBar = false) => query((everyBar ? unmasked : registry).get(id), cycle),
        // Whether what the patterns answer is what the code now says, give or take a slider.
        inStep: () => evaluatedCode !== null && maskSliders(evaluatedCode) === maskSliders(mirror?.code ?? lastCode),
        audible: (cycle) => query(mirror?.repl.state.pattern, cycle - offset),
        waveform() {
            try {
                return wholeSound()
            } catch {
                return null
            }
        },
        setMix(given) {
            mix = fitMix(given)
            applyMix()
        },
        mix: () => mix,
        levels() {
            try {
                return sidesNow()
            } catch {
                return null
            }
        },
        miniEvents(text, cycles) {
            try {
                const pattern = mini(text)
                return Array.from({ length: cycles }, (_, cycle) =>
                    pattern
                        .queryArc(cycle, cycle + 1)
                        .filter((hap: any) => hap.whole && hap.hasOnset())
                        .map((hap: any) => ({ start: hap.whole.begin.valueOf() - cycle, length: hap.whole.end.valueOf() - hap.whole.begin.valueOf(), value: hap.value })),
                )
            } catch {
                return null
            }
        },
        soundNames(bank) {
            if (!bank) return []
            const prefix = `${bank}_`.toLowerCase()
            return Object.keys(soundMap.get())
                .filter((key) => key.toLowerCase().startsWith(prefix))
                .map((key) => key.slice(prefix.length))
        },
        // A sample plays to its end however short the note is. A recording of your own can
        // be minutes long, so listening to one is cut after a few seconds.
        preview(sound, bank, cutAfter) {
            const cut = cutAfter ? { clip: 1 } : {}
            audition(() => (bank ? { s: sound, bank, ...cut } : { s: sound, ...cut }), cutAfter ?? 0.4)
        },
        // A stretch of a sample, from and to as parts of its whole length.
        previewPart(sound, begin, end, seconds) {
            audition(() => ({ s: sound, begin, end, clip: 1 }), seconds)
        },
        addSound: addOwnSound,
        removeSound: removeOwnSound,
        soundTaken,
        // How long a file is as sound, or null when it is not sound this machine can read.
        async audioLength(bytes) {
            try {
                return (await getAudioContext().decodeAudioData(bytes)).duration
            } catch {
                return null
            }
        },
        // A file as the sound in it, or null when it is not sound this machine can read. It
        // comes at the rate of the clock that reads it: the one you listen on, or, when a rate
        // is asked for, one of that rate that is made for this and never runs.
        async decodeAudio(bytes, sampleRate) {
            try {
                const clock = sampleRate ? new OfflineAudioContext(1, 1, sampleRate) : getAudioContext()
                const heard = await clock.decodeAudioData(bytes)
                return { channels: Array.from({ length: heard.numberOfChannels }, (_, at) => heard.getChannelData(at)), sampleRate: heard.sampleRate }
            } catch {
                return null
            }
        },
        // Live, every pattern goes round as if no bars had been written for it: nothing of the
        // song's arrangement is followed, and there is no end to stop at. Going back to the
        // song while it plays starts from the start bar.
        setGuard(on) {
            guarded = on
        },
        setLive(on) {
            if (liveMode === on) return
            liveMode = on
            resumeAt = null
            if (state.paused) setState({ paused: false })
            if (!mirror || !state.playing || blank()) return
            offset = on ? 0 : startBar - Math.floor(mirror.repl.scheduler.now())
            void mirror.evaluate(true)
        },
        previewNote(midi, sound, seconds = 0.3) {
            audition(() => ({ note: midi, s: sound ?? 'triangle' }), seconds)
        },
        sounds() {
            const seen = new Set<unknown>()
            const list: RawSound[] = []
            for (const [name, entry] of Object.entries<any>(soundMap.get())) {
                if (seen.has(entry)) continue
                seen.add(entry)
                list.push({ name, type: String(entry?.data?.type ?? ''), tag: entry?.data?.tag ?? null })
            }
            return list
        },
        kitNames,
        markBlocks(marks) {
            mirror?.editor.dispatch({ effects: setMarks.of(marks) })
        },
        reveal(offset) {
            const position = Math.min(offset, mirror.editor.state.doc.length)
            mirror.editor.dispatch({ effects: EditorView.scrollIntoView(position, { y: 'nearest' }) })
        },
        onCodeChange: (fn) => void codeFns.add(fn),
        onMoved: (fn) => void movedFns.add(fn),
        onState: (fn) => void stateFns.add(fn),
        onCursor: (fn) => void cursorFns.add(fn),
        onSoundDrop: (fn) => void dropFns.add(fn),
        onEvaluated: (fn) => void evaluatedFns.add(fn),
    }
    return engine
}
