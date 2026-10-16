import * as core from '@strudel/core'
import { evalScope } from '@strudel/core'
import { aliasBank, getAudioContext, onceEnded, registerSound, registerSynthSounds, registerZZFXSounds, releaseAudioNode, samples, soundMap } from '@strudel/webaudio'
import { INSTRUMENT_TAG, KIT_TAG, YOURS_TAG } from '../sounds/catalog'
import type { Job } from './ahead'
import { builtKey, keepUpTo, MOST_KEPT, zzfxParams } from './zzfx'
import { clearHydra, H, initHydra } from './hydra'

const DOUGH = 'https://raw.githubusercontent.com/felixroos/dough-samples/main'
const ALIASES = 'https://raw.githubusercontent.com/todepond/samples/main'
const DRUMKIT = 'https://raw.githubusercontent.com/tidalcycles/uzu-drumkit/main'

let kits: string[] = []

// Strudel keeps every sound name in lower case. The pack's own file is the only place
// that still has a kit's name as it is written in code, so the names are read from it.
export const kitNames = (): string[] => kits

const ZZFX = ['zzfx', 'z_sine', 'z_sawtooth', 'z_triangle', 'z_square', 'z_tan', 'z_noise']
const built = keepUpTo<AudioBuffer>(MOST_KEPT)

// Strudel's own way of playing a ZZFX synth works the note out and plays it. A note that is not
// kept yet is still played that way, and what was worked out for it is kept from there. A note
// that is kept is played the way Strudel plays one it has just worked out.
function keepBuiltNotes(): void {
    const known = soundMap.get()
    for (const name of ZZFX) {
        const sound = known[name]
        if (!sound) continue
        registerSound(
            name,
            (t: number, value: Record<string, unknown>, onended: () => void) => {
                const context: BaseAudioContext = getAudioContext()
                const key = builtKey({ s: name, ...value }, context.sampleRate)
                const kept = key === null ? undefined : built.find(key)
                if (!kept) {
                    const made = sound.onTrigger(t, value, onended)
                    const buffer: AudioBuffer | undefined = made?.node?.buffer
                    if (key !== null && buffer) built.keep(key, buffer, buffer.length)
                    return made
                }
                const node = context.createBufferSource()
                node.buffer = kept
                node.start(t)
                onceEnded(node, () => {
                    releaseAudioNode(node)
                    onended()
                })
                return { node, nodes: { source: [node] }, stop: () => {} }
            },
            sound.data,
        )
    }
}

// The first time a note of a ZZFX synth is met it has to be worked out, and a long chord holds
// the window up for that long. A note that a pattern will play is known well before it is due,
// so it is worked out then, in a worker, and kept where a note that was played is kept. One
// that is due before the worker is done with it is worked out on the spot, as it always was.
let builder: Worker | null | undefined
const building = new Map<number, { key: string; rate: number; done: () => void }>()
let builds = 0
const stopBuilding = () => {
    for (const each of building.values()) each.done()
    building.clear()
    builder = null
}
function builderNow(): Worker | null {
    if (builder !== undefined) return builder
    try {
        builder = new Worker(new URL('./zzfx.worker.ts', import.meta.url), { type: 'module' })
        builder.onmessage = (event: MessageEvent<{ id: number; samples: Float32Array }>) => {
            const asked = building.get(event.data.id)
            if (!asked) return
            building.delete(event.data.id)
            try {
                const context: BaseAudioContext = getAudioContext()
                // Worked out for the clock that was in use when it was asked for.
                if (context.sampleRate === asked.rate && !(context instanceof OfflineAudioContext)) {
                    const buffer = context.createBuffer(1, event.data.samples.length, asked.rate)
                    buffer.getChannelData(0).set(event.data.samples)
                    built.keep(asked.key, buffer, buffer.length)
                }
            } finally {
                asked.done()
            }
        }
        builder.onerror = stopBuilding
    } catch {
        builder = null
    }
    return builder
}

// `value` is the note as it will be handed over, with how long it lasts.
export function zzfxAhead(value: Record<string, unknown>): Job | null {
    if (typeof value.s !== 'string' || value.bank || !ZZFX.includes(value.s.toLowerCase())) return null
    const context: BaseAudioContext = getAudioContext()
    if (context instanceof OfflineAudioContext) return null
    const rate = context.sampleRate
    const key = builtKey(value, rate)
    if (key === null) return null
    return {
        key,
        run: () => {
            if (getAudioContext() instanceof OfflineAudioContext) return null
            let params: number[] | null = null
            try {
                params = built.find(key) ? null : zzfxParams(value, core)
            } catch {
                return Promise.resolve()
            }
            const worker = params && builderNow()
            if (!params || !worker) return Promise.resolve()
            return new Promise<void>((done) => {
                const id = ++builds
                building.set(id, { key, rate, done })
                worker.postMessage({ id, params, sampleRate: rate })
            })
        },
    }
}

// An instrument from a soundfont fetches its file, and the part of it for a pitch, when the
// first note of that pitch is handed over, and that note is lost meanwhile. Both are fetched
// for a note that a pattern will play, long before it is due.
let fontSource: ((font: string, value: Record<string, unknown>, context: BaseAudioContext) => Promise<unknown>) | null = null
export function fontAhead(sound: { data?: { type?: string; fonts?: unknown } }, value: Record<string, unknown>): Job | null {
    const fonts = sound.data?.type === 'soundfont' ? sound.data.fonts : null
    const source = fontSource
    if (!source || !Array.isArray(fonts) || !fonts.length) return null
    // Which of an instrument's fonts a note plays, as Strudel picks it.
    const n = Number(value.n)
    const font: string = fonts[(((Math.round(Number.isNaN(n) ? 0 : n) % fonts.length) + fonts.length) % fonts.length)]
    return {
        key: `font ${font} ${value.note} ${value.freq}`,
        run: () => {
            const context: BaseAudioContext = getAudioContext()
            return context instanceof OfflineAudioContext ? null : source(font, value, context).catch(() => undefined)
        },
    }
}

export async function loadModules(): Promise<void> {
    await evalScope(
        core,
        import('@strudel/draw'),
        import('@strudel/mini'),
        import('@strudel/tonal'),
        import('@strudel/webaudio'),
        import('@strudel/codemirror'),
        { initHydra, clearHydra, H },
    )
    await Promise.all([registerSynthSounds(), registerZZFXSounds()])
    keepBuiltNotes()
}

export async function loadSamples(): Promise<void> {
    const { registerSoundfonts, getFontBufferSource } = await import('@strudel/soundfonts')
    fontSource = getFontBufferSource
    const machines: Record<string, unknown> = await fetch(`${DOUGH}/tidal-drum-machines.json`).then((response) => response.json())
    kits = [...new Set(Object.keys(machines).flatMap((key) => (key.startsWith('_') ? [] : [key.split('_')[0]])))]
    await Promise.all([
        registerSoundfonts(),
        samples(machines, machines._base, { tag: KIT_TAG }),
        samples(`${DOUGH}/piano.json`, undefined, { tag: INSTRUMENT_TAG }),
        samples(`${DOUGH}/Dirt-Samples.json`),
        samples(`${DOUGH}/vcsl.json`),
        samples(`${DRUMKIT}/strudel.json`),
    ])
    await aliasBank(`${ALIASES}/tidal-drum-machines-alias.json`)
}

// A sound of your own is known by its name alone, and also as that name in every drum kit:
// a drum grid says which kit it is on once, for all of its rows, so a row with a sound of
// your own would otherwise be looked for in that kit and not be found.
const inKits = (name: string) => kits.map((kit) => `${kit.toLowerCase()}_${name}`)

// Strudel copies its whole map of sounds for every name that is set in it or taken out of it.
// The names of a sound of your own are many, so they are all set in one copy, or left out of
// one, and the map is written once.
export async function addOwnSound(name: string, url: string): Promise<void> {
    await samples({ [name]: [url] }, '', { tag: YOURS_TAG })
    const known = soundMap.get()
    soundMap.set({ ...known, ...Object.fromEntries(inKits(name).map((key) => [key, known[name]])) })
}

// Every name the sound is known under goes, whoever gave it the name: Strudel hands out names
// of its own for kits that have more than one, and a sound left under one of those would be
// listed as a sound of yours that nobody added.
export function removeOwnSound(name: string): void {
    const known = soundMap.get()
    const sound = known[name]
    const gone = new Set([name, ...inKits(name)])
    soundMap.set(Object.fromEntries(Object.entries(known).filter(([key, other]) => !gone.has(key) && (!sound || other !== sound))))
}

export function soundTaken(name: string): boolean {
    const known = soundMap.get()
    return [name, ...inKits(name)].some((key) => key in known)
}
