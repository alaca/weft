import * as core from '@strudel/core'
import { evalScope } from '@strudel/core'
import { aliasBank, getAudioContext, onceEnded, registerSound, registerSynthSounds, registerZZFXSounds, releaseAudioNode, samples, soundMap } from '@strudel/webaudio'
import { INSTRUMENT_TAG, KIT_TAG, YOURS_TAG } from '../sounds/catalog'
import { builtKey, keepUpTo, MOST_KEPT } from './zzfx'

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

export async function loadModules(): Promise<void> {
    await evalScope(
        core,
        import('@strudel/draw'),
        import('@strudel/mini'),
        import('@strudel/tonal'),
        import('@strudel/webaudio'),
        import('@strudel/codemirror'),
    )
    await Promise.all([registerSynthSounds(), registerZZFXSounds()])
    keepBuiltNotes()
}

export async function loadSamples(): Promise<void> {
    const { registerSoundfonts } = await import('@strudel/soundfonts')
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

export async function addOwnSound(name: string, url: string): Promise<void> {
    await samples({ [name]: [url] }, '', { tag: YOURS_TAG })
    const entry = soundMap.get()[name]
    for (const key of inKits(name)) soundMap.setKey(key, entry)
}

// Every name the sound is known under goes, whoever gave it the name: Strudel hands out names
// of its own for kits that have more than one, and a sound left under one of those would be
// listed as a sound of yours that nobody added.
export function removeOwnSound(name: string): void {
    const known = soundMap.get()
    const sound = known[name]
    for (const key of [name, ...inKits(name)]) soundMap.setKey(key, undefined)
    if (!sound) return
    for (const [key, other] of Object.entries(known)) {
        if (other === sound) soundMap.setKey(key, undefined)
    }
}

export function soundTaken(name: string): boolean {
    const known = soundMap.get()
    return [name, ...inKits(name)].some((key) => key in known)
}
