import { registerWorklet } from '@strudel/webaudio'
import ownSupersaw from './supersaw.worklet.js?url&no-inline'

const THEIRS = 'supersaw-oscillator'
const OURS = 'weft-supersaw'

let done = false

// superdough asks for its supersaw by name. Every node made under that name is made with the one
// of this app in its place, which is the same sound without the message port. Where an audio
// context has not got it, superdough's own is made as before.
export function useOwnSupersaw() {
    if (done || typeof AudioWorkletNode === 'undefined') return
    done = true
    registerWorklet(ownSupersaw)
    window.AudioWorkletNode = new Proxy(AudioWorkletNode, {
        construct(theirs, args: [BaseAudioContext, string, AudioWorkletNodeOptions?], asked) {
            const [context, name, options] = args
            if (name === THEIRS) {
                try {
                    return Reflect.construct(theirs, [context, OURS, options], asked)
                } catch {
                    // Not made known to this context: the note is played by superdough's own.
                }
            }
            return Reflect.construct(theirs, args, asked)
        },
    })
}
