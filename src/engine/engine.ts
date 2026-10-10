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
import { loadModules, loadSamples } from './prebake'
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
    events(id: string, cycle: number): PatternEvent[]
    audible(cycle: number): PatternEvent[]
    waveform(): Float32Array | null
    setMasterVolume(value: number): void
    masterVolume(): number
    miniEvents(text: string, cycles: number): { start: number; value: unknown }[][] | null
    soundNames(bank: string | null): string[]
    preview(sound: string, bank: string | null): void
    markBlocks(marks: BlockMark[]): void
    reveal(offset: number): void
    onCodeChange(fn: (code: string) => void): void
    onState(fn: (state: EngineState) => void): void
    onCursor(fn: (offset: number) => void): void
    onEvaluated(fn: () => void): void
}

const bareId = (id: string) => id.replace(/^_+|_+$/g, '')

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
        Pattern.prototype.p = function (this: unknown, id: unknown) {
            if (typeof id !== 'string') return original.call(this, id)
            const bare = bareId(id)
            const key = bare.includes('$') ? `pattern ${++anonymous}` : bare
            pending.set(key, this)
            if (soloIds.length && !soloIds.includes(key)) return silence
            return original.call(this, id)
        }
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
            await mirror.repl.evaluate(mirror.code, false)
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
            await mirror.evaluate(true)
        },
        async refresh() {
            await mirror.repl.evaluate(mirror.code, false)
        },
        stop() {
            mirror.stop()
        },
        setSolo(ids) {
            soloIds = ids
            if (state.playing) void mirror.evaluate(true)
        },
        now: () => (mirror?.repl.scheduler.started ? mirror.repl.scheduler.now() : 0),
        bpm: () => (mirror ? mirror.repl.scheduler.cps * 240 : 120),
        events: (id, cycle) => query(registry.get(id), cycle),
        audible: (cycle) => query(mirror?.repl.state.pattern, cycle),
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
                        .map((hap: any) => ({ start: hap.whole.begin.valueOf() - cycle, value: hap.value })),
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
            try {
                const value = bank ? { s: sound, bank } : { s: sound }
                Promise.resolve(superdough(value, getAudioContext().currentTime + 0.02, 0.4)).catch(() => undefined)
            } catch {
                return
            }
        },
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
