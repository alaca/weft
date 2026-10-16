import { registerControl } from '@strudel/core'
import { getAudioContext, getSuperdoughAudioController, registerSound } from '@strudel/webaudio'
import { getADSRValues, getFrequencyFromValue, getParamADSR } from 'superdough'
import { EFFECT_CALL, PLUGINS, pluginNamed, type Plugin } from '../plugins/list'

// The plugins that come with the app (plugins/list.ts), played by Faust compiled to WebAssembly.
// Nothing of Faust is loaded until a song asks for a plugin. The audio worklet nodes Faust plays
// in are made once and used again, since WebKit never lets go of one while the audio runs.
//
// A plugin sound gives each note a voice of its own for as long as the note sounds, so that the
// filters, the envelope and the room of the pattern work on it as on any other sound. A plugin
// effect is one for each pattern that uses it: the pattern's notes go to it over a bus of
// Strudel's, in place of going straight out, and it goes out where they would have.

type Factory = { module: WebAssembly.Module; json: string; soundfiles: Record<string, never> }
type Voice = { node: any; until: number }
type Effect = { node: any; bus: number; from: AudioNode | null; to: AudioNode | null }

const VOICES = 8
// How long a note of a plugin sound is let ring after it ends, before its voice is free again.
const RING = 2
const SHAPE = ['attack', 'decay', 'sustain', 'release']

const factories = new Map<string, Promise<{ factory: Factory; paths: Map<string, string> }>>()
const voicesBy = new WeakMap<BaseAudioContext, Map<string, Promise<Voice[]>>>()
const effectsBy = new WeakMap<BaseAudioContext, Map<string, Promise<Effect>>>()
let nextBus = 1000

// The part of Faust that plays a plugin, bundled beside the plugins as it was written (see
// scripts/build-plugins.mjs) and loaded from there as it is, past the bundler, which would
// otherwise take it in and shorten its names.
let runtime: Promise<any> | null = null
const generator = async () => {
    runtime ??= fetch('/plugins/faust.js')
        .then((answer) => answer.text())
        .then((text) => import(/* @vite-ignore */ URL.createObjectURL(new Blob([text], { type: 'text/javascript' }))))
    runtime.catch(() => (runtime = null))
    return new (await runtime).FaustMonoDspGenerator()
}

// A plugin as it was compiled, and the address of each of its sliders by the slider's name.
function loaded(name: string) {
    let made = factories.get(name)
    if (!made) {
        made = (async () => {
            const [bytes, json] = await Promise.all([
                fetch(`/plugins/${name}/dsp-module.wasm`).then((answer) => answer.arrayBuffer()),
                fetch(`/plugins/${name}/dsp-meta.json`).then((answer) => answer.text()),
            ])
            const paths = new Map<string, string>()
            const walk = (items: { label?: string; address?: string; items?: unknown[] }[]) => {
                for (const item of items ?? []) {
                    if (item.items) walk(item.items as typeof items)
                    else if (item.label && item.address) paths.set(item.label, item.address)
                }
            }
            walk(JSON.parse(json).ui)
            return { factory: { module: await WebAssembly.compile(bytes), json, soundfiles: {} }, paths }
        })()
        made.catch(() => factories.delete(name))
        factories.set(name, made)
    }
    return made
}

function voicesOf(context: BaseAudioContext, name: string): Promise<Voice[]> {
    let mine = voicesBy.get(context)
    if (!mine) voicesBy.set(context, (mine = new Map()))
    let voices = mine.get(name)
    if (!voices) {
        const kept = mine
        voices = (async () => {
            const { factory } = await loaded(name)
            const made: Voice[] = []
            for (let at = 0; at < VOICES; at++) made.push({ node: await (await generator()).createNode(context, name, factory), until: 0 })
            return made
        })()
        voices.catch(() => kept.delete(name))
        mine.set(name, voices)
    }
    return voices
}

function registerPluginSound(plugin: Plugin) {
    registerSound(
        plugin.name,
        async (t: number, value: Record<string, any>, onended: () => void) => {
            const context: BaseAudioContext = getAudioContext()
            const [voices, { paths }] = await Promise.all([voicesOf(context, plugin.name), loaded(plugin.name)])
            const end = t + (value.duration ?? 0.25)
            const voice = voices.find((one) => one.until <= t) ?? voices.reduce((a, b) => (a.until <= b.until ? a : b))
            const taken = voice.until > t
            voice.until = end + RING
            const set = (param: string, amount: number, when: number) => {
                const path = paths.get(param)
                if (path) voice.node.setParamValue(path, amount, when)
            }
            for (const knob of plugin.knobs) if (typeof value[knob.fn] === 'number') set(knob.param, value[knob.fn], t)
            set('freq', getFrequencyFromValue(value), t)
            // A voice taken from a note that still rings starts over, as a string plucked again.
            if (taken) set('gate', 0, t)
            set('gate', 1, taken ? t + 0.003 : t)
            set('gate', 0, end)
            const out = new GainNode(context, { gain: 1 })
            if (SHAPE.some((name) => value[name] !== undefined)) {
                const [attack, decay, sustain, release] = getADSRValues([value.attack, value.decay, value.sustain, value.release], 'linear', [0.001, 0.05, 1, 0.05])
                getParamADSR(out.gain, attack, decay, sustain, release, 0, 1, t, end, 'linear')
            }
            voice.node.connect(out)
            let over = false
            const finish = () => {
                if (over) return
                over = true
                voice.node.disconnect(out)
                onended()
            }
            const timer = setTimeout(finish, Math.max(0, (end + RING - context.currentTime) * 1000))
            return {
                node: out,
                stop: (when: number) => {
                    set('gate', 0, when)
                    clearTimeout(timer)
                    setTimeout(finish, Math.max(0, (when + 0.1 - context.currentTime) * 1000))
                },
            }
        },
        { type: 'synth', prebake: true },
    )
}

function effectOf(context: BaseAudioContext, key: string, name: string): Promise<Effect> {
    let mine = effectsBy.get(context)
    if (!mine) effectsBy.set(context, (mine = new Map()))
    let effect = mine.get(key)
    if (!effect) {
        const kept = mine
        effect = (async () => {
            const { factory } = await loaded(name)
            return { node: await (await generator()).createNode(context, name, factory), bus: nextBus++, from: null, to: null }
        })()
        effect.catch(() => kept.delete(key))
        mine.set(key, effect)
    }
    return effect
}

// A note of a pattern with a plugin effect, sent through it. The bus and the place the effect
// goes out to are asked for every time: Strudel makes them anew when the song is stopped or a
// file is made, and the effect is then joined to the new ones.
export async function throughEffect(value: Record<string, any>, pattern: string | undefined, time: number): Promise<Record<string, any>> {
    const plugin = pluginNamed(value?.[EFFECT_CALL])
    if (!plugin || plugin.kind !== 'effect' || !pattern) return value
    const context: BaseAudioContext = getAudioContext()
    const [effect, { paths }] = await Promise.all([effectOf(context, `${pattern}\u0000${plugin.name}`, plugin.name), loaded(plugin.name)])
    const controller = getSuperdoughAudioController()
    const from: AudioNode = controller.getBus(effect.bus)
    const to: AudioNode = controller.getOrbit(value.orbit ?? 1).output
    if (from !== effect.from) {
        from.connect(effect.node)
        effect.from = from
    }
    if (to !== effect.to) {
        if (effect.to) effect.node.disconnect(effect.to)
        effect.node.connect(to)
        effect.to = to
    }
    for (const knob of plugin.knobs) {
        const path = paths.get(knob.param)
        if (path && typeof value[knob.fn] === 'number') effect.node.setParamValue(path, value[knob.fn], time)
    }
    return { ...value, bus: effect.bus, dry: 0 }
}

// The plugins a piece of code asks for are loaded before its first note, so that it is not late.
export function warmPlugins(code: string) {
    for (const plugin of PLUGINS) {
        if (!code.includes(`"${plugin.name}"`) && !code.includes(`'${plugin.name}'`)) continue
        void loaded(plugin.name).catch(() => undefined)
        if (plugin.kind === 'sound') void voicesOf(getAudioContext(), plugin.name).catch(() => undefined)
    }
}

let done = false
export function registerPlugins() {
    if (done) return
    done = true
    registerControl(EFFECT_CALL)
    for (const plugin of PLUGINS) {
        for (const knob of plugin.knobs) registerControl(knob.fn)
        if (plugin.kind === 'sound') registerPluginSound(plugin)
    }
}
