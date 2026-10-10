import { EditorState, Prec, StateEffect } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { StrudelMirror, codemirrorSettings } from '@strudel/codemirror'
import { Pattern, silence } from '@strudel/core'
import { mini } from '@strudel/mini'
import { transpiler } from '@strudel/transpiler'
import {
    getAnalyzerData,
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
import type { PatternEvent, TextEdit } from '../song/types'
import { toEvents } from './events'
import { marksField, setMarks, type BlockMark } from './marks'
import { maskSliders } from './mask'
import type { RawSound } from '../sounds/catalog'
import { kitNames, loadModules, loadSamples } from './prebake'
import { registerTheme } from './theme'

export type { BlockMark } from './marks'

export type EvalError = { message: string; line: number | null }
export type Rendered = { channels: Float32Array[]; sampleRate: number; missed: number }

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
    selectAll(): void
    moveSlider(from: number, text: string): boolean
    evaluate(): Promise<void>
    refresh(): Promise<void>
    pause(): void
    stop(): void
    setSolo(ids: string[]): void
    now(): number
    bpm(): number
    events(id: string, cycle: number, everyBar?: boolean): PatternEvent[]
    inStep(): boolean
    setStart(bar: number): void
    setEnd(bar: number | null): void
    render(bars: number, tailSeconds: number, onProgress?: (done: number) => void): Promise<Rendered>
    audible(cycle: number): PatternEvent[]
    waveform(): Float32Array | null
    setMasterVolume(value: number): void
    masterVolume(): number
    miniEvents(text: string, cycles: number): { start: number; length: number; value: unknown }[][] | null
    soundNames(bank: string | null): string[]
    preview(sound: string, bank: string | null): void
    previewNote(midi: number, sound: string | null, seconds?: number): void
    sounds(): RawSound[]
    kitNames(): string[]
    markBlocks(marks: BlockMark[]): void
    reveal(offset: number): void
    onCodeChange(fn: (code: string) => void): void
    onState(fn: (state: EngineState) => void): void
    onCursor(fn: (offset: number) => void): void
    onEvaluated(fn: () => void): void
}

const bareId = (id: string) => id.replace(/^_+|_+$/g, '')
const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))
const SETTLE = 300
const BEFORE_MASK = '__weftBeforeMask'

function toEvalError(err: unknown): EvalError {
    const e = err as { message?: string; loc?: { line?: number } }
    return {
        message: String(e?.message ?? err).replace(/\s*\(\d+:\d+\)$/, ''),
        line: typeof e?.loc?.line === 'number' ? e.loc.line : null,
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

export function createEngine(): Engine {
    keepPartsToTheirClock()
    let mirror: any = null
    let state: EngineState = { playing: false, paused: false, dirty: false, error: null, sounds: 'loading' }
    let registry = new Map<string, any>()
    let pending = new Map<string, any>()
    let unmasked = new Map<string, any>()
    let pendingUnmasked = new Map<string, any>()
    let startBar = 0
    let endBar: number | null = null
    let offset = 0
    // Strudel's own pause plays everything it missed at once when it goes on. Pausing here is
    // stopping while remembering where the song was, and going on is starting from there.
    let resumeAt: number | null = null
    let baseExtensions: unknown = null
    let evaluatedCode: string | null = null
    let dress: () => void = () => undefined
    let soloIds: string[] = []
    let evaluated = false
    let lastCode = ''
    let master = 1
    const applyMaster = () => {
        try {
            const gain = getSuperdoughAudioController().output.destinationGain
            if (gain) gain.gain.value = master
        } catch {
            return
        }
    }
    const stateFns = new Set<(state: EngineState) => void>()
    const codeFns = new Set<(code: string) => void>()
    const cursorFns = new Set<(offset: number) => void>()
    const evaluatedFns = new Set<() => void>()

    const setState = (patch: Partial<EngineState>) => {
        state = { ...state, ...patch }
        stateFns.forEach((fn) => fn(state))
    }

    const wrapRegistration = () => {
        const original = Pattern.prototype.p
        let anonymous = 0
        pending = new Map()
        pendingUnmasked = new Map()
        Pattern.prototype.p = function (this: any, id: unknown) {
            if (typeof id !== 'string') return original.call(this, id)
            const bare = bareId(id)
            const key = bare.includes('$') ? `pattern ${++anonymous}` : bare
            pending.set(key, this)
            pendingUnmasked.set(key, this[BEFORE_MASK] ?? this)
            if (soloIds.length && !soloIds.includes(key)) return silence
            // Strudel looks a little ahead, so the bar after the last one would already have
            // started to sound by the time the song is stopped at its end. Nothing that starts
            // at or after the end is let through. The end is read as it is now, not as it was
            // when the code was evaluated, because the song grows and shrinks as it is arranged.
            const shift = offset
            const within = (hap: any) => endBar === null || (hap.whole ?? hap.part).begin.valueOf() + shift < endBar
            return original.call((shift ? this.early(shift) : this).filterHaps(within), id)
        }
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

    const audition = (make: () => Record<string, unknown>, seconds: number) => {
        wakeAudio()
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

    // Strudel throws when it is given no code at all, so an empty song is handled here:
    // nothing plays, nothing is registered and there is no error to show.
    const blank = () => !String(mirror?.code ?? lastCode).trim()
    const silence = () => {
        mirror.stop()
        registry = new Map()
        unmasked = new Map()
        evaluated = false
        evaluatedCode = null
        resumeAt = null
        if (state.paused) setState({ paused: false })
        setState({ error: null, dirty: false })
        announce()
    }

    const query = (pattern: any, cycle: number): PatternEvent[] => {
        if (!pattern) return []
        try {
            return toEvents(pattern.queryArc(cycle, cycle + 1), cycle)
        } catch {
            return []
        }
    }

    const makeMirror = (root: HTMLElement, initialCode: string) =>
        new StrudelMirror({
            defaultOutput: webaudioOutput,
            getTime: () => getAudioContext().currentTime,
            transpiler,
            root,
            initialCode,
            drawTime: [0, 0],
            bgFill: false,
            solo: false,
            prebake: loadModules,
            editPattern: (pattern: any) => pattern.analyze('weft'),
            beforeEval: wrapRegistration,
            afterEval: (done: { code?: string }) => {
                applyMaster()
                registry = pending
                unmasked = pendingUnmasked
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
                    codeFns.forEach((fn) => fn(code))
                }
                const playing = Boolean(s.started)
                const dirty = evaluated && maskSliders(code) !== maskSliders(s.activeCode ?? '')
                if (playing !== state.playing || dirty !== state.dirty) setState({ playing, dirty })
            },
        })

    const engine: Engine = {
        async mount(root, initialCode) {
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
                    isAutoCompletionEnabled: false,
                    isTooltipEnabled: false,
                    isTabIndentationEnabled: false,
                    isMultiCursorEnabled: false,
                })
                mirror.editor.dispatch({
                    effects: StateEffect.appendConfig.of([
                        marksField,
                        Prec.highest(
                            keymap.of([
                                { key: 'Mod-Enter', run: () => (void engine.evaluate(), true) },
                                { key: 'Mod-.', run: () => (engine.stop(), true) },
                            ]),
                        ),
                        EditorView.updateListener.of((update) => {
                            if (update.selectionSet) cursorFns.forEach((fn) => fn(update.state.selection.main.head))
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
            codeFns.forEach((fn) => fn(code))
        },
        applyEdit(edit) {
            const changes = Array.isArray(edit) ? [...edit].sort((a, b) => a.from - b.from) : edit
            mirror.editor.dispatch({ changes })
        },
        selectAll() {
            mirror.editor.dispatch({ selection: { anchor: 0, head: mirror.editor.state.doc.length } })
            mirror.editor.focus()
        },
        moveSlider(from, text) {
            type Widget = HTMLInputElement & { from: number; originalFrom: number; originalValue: string }
            const inputs = mirror.root.querySelectorAll('.cm-slider input') as NodeListOf<Widget>
            for (const input of inputs) {
                if (input.from !== from) continue
                mirror.editor.dispatch({ changes: { from, to: from + input.originalValue.length, insert: text } })
                input.originalValue = text
                input.value = text
                window.postMessage({ type: 'cm-slider', value: Number(text), id: `slider_${input.originalFrom}` })
                return true
            }
            return false
        },
        async evaluate() {
            wakeAudio()
            if (blank()) return silence()
            if (!state.playing) offset = resumeAt ?? startBar
            resumeAt = null
            if (state.paused) setState({ paused: false })
            await mirror.evaluate(true)
        },
        async refresh() {
            if (blank()) return silence()
            if (!state.playing) offset = resumeAt ?? startBar
            await mirror.repl.evaluate(mirror.code, false)
        },
        pause() {
            if (!state.playing) return
            resumeAt = engine.now()
            setState({ paused: true })
            mirror.stop()
        },
        // Strudel always starts counting cycles at nought, so playing from another bar is done
        // by moving every pattern earlier. While it plays, the same move makes the song jump.
        setStart(bar) {
            startBar = bar
            resumeAt = null
            if (state.paused) setState({ paused: false })
            if (!state.playing || blank()) return
            offset = bar - Math.floor(mirror.repl.scheduler.now())
            void mirror.evaluate(true)
        },
        setEnd(bar) {
            endBar = bar
        },
        // The song as a recording, made faster than it plays: every sound of the song is
        // handed to an audio clock that is not the one you listen on, and that clock then runs
        // through the song as fast as the machine can. The song is evaluated from its first
        // bar with nothing soloed for this, and put back as it was afterwards.
        async render(bars, tailSeconds, onProgress) {
            if (blank()) throw new Error('There is nothing in this song to play.')
            engine.stop()
            const before = { soloIds, offset, endBar }
            const live = getAudioContext()
            const liveController = getSuperdoughAudioController()
            // Strudel tidies up after each sound with a timer that takes for granted there is
            // one audio clock, and fails when a sound ends while the other clock is the one in
            // use. So the clock you listen on is held still for as long as the other one is in
            // use, after a moment for what still rings, and the other one is given a moment to
            // finish tidying before the first is put back.
            await pause(SETTLE)
            await live.suspend().catch(() => undefined)
            let missed = 0
            soloIds = []
            offset = 0
            endBar = bars
            try {
                await mirror.repl.evaluate(mirror.code, false)
                if (state.error) throw new Error(state.error.message)
                const pattern = mirror.repl.state.pattern
                const cps: number = mirror.repl.scheduler.cps
                const rate = live.sampleRate
                const clock = new OfflineAudioContext(2, Math.ceil((bars / cps + tailSeconds) * rate), rate)
                setAudioContext(clock)
                setSuperdoughAudioController(null)
                await initAudio()
                const haps = pattern
                    .queryArc(0, bars, { _cps: cps })
                    .filter((hap: any) => hap.hasOnset())
                    .sort((a: any, b: any) => a.whole.begin.valueOf() - b.whole.begin.valueOf())
                for (let at = 0; at < haps.length; at++) {
                    const hap = haps[at]
                    const begin = hap.whole.begin.valueOf()
                    hap.ensureObjectValue()
                    await superdough({ ...hap.value }, begin / cps, hap.duration.valueOf() / cps, cps, begin).catch(() => void missed++)
                    if (at % 200 === 199) {
                        onProgress?.((at + 1) / haps.length)
                        await pause(0)
                    }
                }
                onProgress?.(1)
                const buffer = await clock.startRendering()
                await pause(SETTLE)
                return { channels: [buffer.getChannelData(0), buffer.getChannelData(1)], sampleRate: rate, missed }
            } finally {
                setAudioContext(live)
                setSuperdoughAudioController(liveController)
                soloIds = before.soloIds
                offset = before.offset
                endBar = before.endBar
                await mirror.repl.evaluate(mirror.code, false).catch(() => undefined)
                applyMaster()
                void live.resume().catch(() => undefined)
            }
        },
        stop() {
            resumeAt = null
            if (state.paused) setState({ paused: false })
            mirror.stop()
        },
        setSolo(ids) {
            soloIds = ids
            if (state.playing) void mirror.evaluate(true)
        },
        now: () => (mirror?.repl.scheduler.started ? mirror.repl.scheduler.now() + offset : (resumeAt ?? startBar)),
        bpm: () => (mirror ? mirror.repl.scheduler.cps * 240 : 120),
        events: (id, cycle, everyBar = false) => query((everyBar ? unmasked : registry).get(id), cycle),
        // Whether what the patterns answer is what the code now says, give or take a slider.
        inStep: () => evaluatedCode !== null && maskSliders(evaluatedCode) === maskSliders(mirror?.code ?? lastCode),
        audible: (cycle) => query(mirror?.repl.state.pattern, cycle - offset),
        waveform() {
            try {
                return (getAnalyzerData('time', 'weft') as Float32Array | undefined) ?? null
            } catch {
                return null
            }
        },
        setMasterVolume(value) {
            master = Math.min(1.5, Math.max(0, value))
            applyMaster()
        },
        masterVolume: () => master,
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
        preview(sound, bank) {
            audition(() => (bank ? { s: sound, bank, analyze: 'weft' } : { s: sound, analyze: 'weft' }), 0.4)
        },
        previewNote(midi, sound, seconds = 0.3) {
            audition(() => ({ note: midi, s: sound ?? 'triangle', analyze: 'weft' }), seconds)
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
        onState: (fn) => void stateFns.add(fn),
        onCursor: (fn) => void cursorFns.add(fn),
        onEvaluated: (fn) => void evaluatedFns.add(fn),
    }
    return engine
}
