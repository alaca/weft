import { Prec, StateEffect } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { StrudelMirror, codemirrorSettings } from '@strudel/codemirror'
import { Pattern, silence } from '@strudel/core'
import { mini } from '@strudel/mini'
import { transpiler } from '@strudel/transpiler'
import {
    getAnalyzerData,
    getAudioContext,
    getSuperdoughAudioController,
    initAudioOnFirstClick,
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

export type EngineState = {
    playing: boolean
    dirty: boolean
    error: EvalError | null
    sounds: 'loading' | 'ready' | 'failed'
}

export interface Engine {
    mount(root: HTMLElement, initialCode: string): Promise<void>
    getCode(): string
    applyEdit(edit: TextEdit | TextEdit[]): void
    moveSlider(from: number, text: string): boolean
    evaluate(): Promise<void>
    refresh(): Promise<void>
    stop(): void
    setSolo(ids: string[]): void
    now(): number
    bpm(): number
    events(id: string, cycle: number, everyBar?: boolean): PatternEvent[]
    setStart(bar: number): void
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
const BEFORE_MASK = '__weftBeforeMask'

function toEvalError(err: unknown): EvalError {
    const e = err as { message?: string; loc?: { line?: number } }
    return {
        message: String(e?.message ?? err).replace(/\s*\(\d+:\d+\)$/, ''),
        line: typeof e?.loc?.line === 'number' ? e.loc.line : null,
    }
}

export function createEngine(): Engine {
    let mirror: any = null
    let state: EngineState = { playing: false, dirty: false, error: null, sounds: 'loading' }
    let registry = new Map<string, any>()
    let pending = new Map<string, any>()
    let unmasked = new Map<string, any>()
    let pendingUnmasked = new Map<string, any>()
    let startBar = 0
    let offset = 0
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
            return original.call(offset ? this.early(offset) : this, id)
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
    const audition = (make: () => Record<string, unknown>, seconds: number) => {
        const fire = async () => {
            const due = getAudioContext().currentTime + 0.05
            await superdough(make(), due, seconds)
            return getAudioContext().currentTime > due
        }
        fire()
            .then((missed) => (missed ? fire() : false))
            .catch(() => undefined)
    }

    // Strudel throws when it is given no code at all, so an empty song is handled here:
    // nothing plays, nothing is registered and there is no error to show.
    const blank = () => !String(mirror?.code ?? lastCode).trim()
    const silence = () => {
        mirror.stop()
        registry = new Map()
        unmasked = new Map()
        evaluated = false
        setState({ error: null, dirty: false })
        evaluatedFns.forEach((fn) => fn())
    }

    const query = (pattern: any, cycle: number): PatternEvent[] => {
        if (!pattern) return []
        try {
            return toEvents(pattern.queryArc(cycle, cycle + 1), cycle)
        } catch {
            return []
        }
    }

    const engine: Engine = {
        async mount(root, initialCode) {
            registerTheme()
            initAudioOnFirstClick()
            lastCode = initialCode
            mirror = new StrudelMirror({
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
                afterEval: () => {
                    applyMaster()
                    registry = pending
                    unmasked = pendingUnmasked
                    evaluated = true
                    setState({ error: null, dirty: false })
                    evaluatedFns.forEach((fn) => fn())
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
            loadSamples().then(
                () => setState({ sounds: 'ready' }),
                () => setState({ sounds: 'failed' }),
            )
            await mirror.prebaked
            keepUnmasked()
            if (!blank()) await mirror.repl.evaluate(mirror.code, false)
        },
        getCode: () => mirror?.code ?? lastCode,
        applyEdit(edit) {
            const changes = Array.isArray(edit) ? [...edit].sort((a, b) => a.from - b.from) : edit
            mirror.editor.dispatch({ changes })
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
            if (blank()) return silence()
            if (!state.playing) offset = startBar
            await mirror.evaluate(true)
        },
        async refresh() {
            if (blank()) return silence()
            if (!state.playing) offset = startBar
            await mirror.repl.evaluate(mirror.code, false)
        },
        // Strudel always starts counting cycles at nought, so playing from another bar is done
        // by moving every pattern earlier. While it plays, the same move makes the song jump.
        setStart(bar) {
            startBar = bar
            if (!state.playing || blank()) return
            offset = bar - Math.floor(mirror.repl.scheduler.now())
            void mirror.evaluate(true)
        },
        stop() {
            mirror.stop()
        },
        setSolo(ids) {
            soloIds = ids
            if (state.playing) void mirror.evaluate(true)
        },
        now: () => (mirror?.repl.scheduler.started ? mirror.repl.scheduler.now() + offset : startBar),
        bpm: () => (mirror ? mirror.repl.scheduler.cps * 240 : 120),
        events: (id, cycle, everyBar = false) => query((everyBar ? unmasked : registry).get(id), cycle),
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
