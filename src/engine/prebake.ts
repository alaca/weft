import * as core from '@strudel/core'
import { evalScope } from '@strudel/core'
import { aliasBank, registerSynthSounds, registerZZFXSounds, samples, soundMap } from '@strudel/webaudio'
import { INSTRUMENT_TAG, KIT_TAG, YOURS_TAG } from '../sounds/catalog'

const DOUGH = 'https://raw.githubusercontent.com/felixroos/dough-samples/main'
const ALIASES = 'https://raw.githubusercontent.com/todepond/samples/main'
const DRUMKIT = 'https://raw.githubusercontent.com/tidalcycles/uzu-drumkit/main'

let kits: string[] = []

// Strudel keeps every sound name in lower case. The pack's own file is the only place
// that still has a kit's name as it is written in code, so the names are read from it.
export const kitNames = (): string[] => kits

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
