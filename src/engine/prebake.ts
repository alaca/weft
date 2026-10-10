import * as core from '@strudel/core'
import { evalScope } from '@strudel/core'
import { aliasBank, registerSynthSounds, registerZZFXSounds, samples } from '@strudel/webaudio'
import { INSTRUMENT_TAG, KIT_TAG } from '../sounds/catalog'

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
