import { registerWorklet } from '@strudel/webaudio'
import own from './own.worklet.js?url&no-inline'
import { canKeep, keepWhenUnplugged, takeKept } from './unplug'

// superdough asks for its processors by name. A node made under one of these names is made
// with the app's own processor in its place: the same sound, without what costs WebKit dearly.
// Where an audio context has not got the app's own, superdough's is made as before.
const OWN: Record<string, string> = {
    'supersaw-oscillator': 'weft-supersaw',
    'crush-processor': 'weft-crush',
    'distort-processor': 'weft-distort',
    'coarse-processor': 'weft-coarse',
    'shape-processor': 'weft-shape',
    'lfo-processor': 'weft-lfo',
}

// The effects and LFOs superdough makes anew for every note that has one. WebKit keeps every
// worklet node until its audio context is closed, about fifteen kilobytes each, so a song with an
// effect on forty notes a second took two gigabytes more in an hour. On the window's own audio
// context such a node is kept when its note is over and given to the next note that asks for the
// same.
const KEPT = new Set(['weft-crush', 'weft-distort', 'weft-coarse', 'weft-shape', 'weft-lfo'])

let done = false

export function useOwnWorklets() {
    if (done || typeof AudioWorkletNode === 'undefined') return
    done = true
    registerWorklet(own)
    window.AudioWorkletNode = new Proxy(AudioWorkletNode, {
        construct(theirs, args: [BaseAudioContext, string, AudioWorkletNodeOptions?], asked) {
            const [context, name, options] = args
            const mine = OWN[name]
            if (mine) {
                const kind = KEPT.has(mine) && context instanceof AudioContext && canKeep() ? `${mine} ${JSON.stringify(options ?? {})}` : ''
                const again = kind ? takeKept(context, kind) : undefined
                if (again) return again
                try {
                    const node = Reflect.construct(theirs, [context, mine, kind ? { ...options, processorOptions: { ...options?.processorOptions, kept: true } } : options], asked)
                    if (kind) keepWhenUnplugged(node, kind)
                    return node
                } catch {
                    // Not made known to this context: the sound is made by superdough's own.
                }
            }
            return Reflect.construct(theirs, args, asked)
        },
    })
}
