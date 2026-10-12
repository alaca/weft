import { registerWorklet } from '@strudel/webaudio'
import own from './own.worklet.js?url&no-inline'

// superdough asks for its processors by name. A node made under one of these names is made
// with the app's own processor in its place: the same sound, without what costs WebKit dearly.
// Where an audio context has not got the app's own, superdough's is made as before.
const OWN: Record<string, string> = {
    'supersaw-oscillator': 'weft-supersaw',
    'crush-processor': 'weft-crush',
    'distort-processor': 'weft-distort',
}

let done = false

export function useOwnWorklets() {
    if (done || typeof AudioWorkletNode === 'undefined') return
    done = true
    registerWorklet(own)
    window.AudioWorkletNode = new Proxy(AudioWorkletNode, {
        construct(theirs, args: [BaseAudioContext, string, AudioWorkletNodeOptions?], asked) {
            const [context, name, options] = args
            if (OWN[name]) {
                try {
                    return Reflect.construct(theirs, [context, OWN[name], options], asked)
                } catch {
                    // Not made known to this context: the sound is made by superdough's own.
                }
            }
            return Reflect.construct(theirs, args, asked)
        },
    })
}
