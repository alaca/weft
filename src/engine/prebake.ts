import * as core from '@strudel/core'
import { evalScope } from '@strudel/core'
import { aliasBank, registerSynthSounds, registerZZFXSounds, samples } from '@strudel/webaudio'

const DOUGH = 'https://raw.githubusercontent.com/felixroos/dough-samples/main'
const ALIASES = 'https://raw.githubusercontent.com/todepond/samples/main'
const DRUMKIT = 'https://raw.githubusercontent.com/tidalcycles/uzu-drumkit/main'

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
    await Promise.all([
        registerSoundfonts(),
        samples(`${DOUGH}/tidal-drum-machines.json`),
        samples(`${DOUGH}/piano.json`),
        samples(`${DOUGH}/Dirt-Samples.json`),
        samples(`${DOUGH}/vcsl.json`),
        samples(`${DRUMKIT}/strudel.json`),
    ])
    await aliasBank(`${ALIASES}/tidal-drum-machines-alias.json`)
}
