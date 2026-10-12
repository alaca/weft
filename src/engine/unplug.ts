// WebKit never lets go of a worklet node while the audio context is open, and for every block
// of sound it works through each one that has nothing plugged into its output, even after the
// code inside it has ended. A song that makes fifty effects a second fills the audio thread
// within minutes, and the sound falls behind. A node whose output goes into something that
// nothing listens to is left alone, so an unplugged one is given a moment to end and is then
// plugged into such a place.
const WAIT = 200
// A place counts all it holds again each time one more is plugged in, so none holds many.
const PER_REST = 256

type Rest = { into: GainNode; held: number; full: GainNode[] }

let done = false

export function restUnpluggedWorklets() {
    if (done || typeof AudioWorkletNode === 'undefined') return
    done = true
    const rests = new WeakMap<BaseAudioContext, Rest>()
    const connect = AudioNode.prototype.connect as (this: AudioNode, to: AudioNode) => AudioNode
    const disconnect = AudioNode.prototype.disconnect as (this: AudioNode, ...args: any[]) => void
    let unplugged = new Set<AudioWorkletNode>()
    let ended = new Set<AudioWorkletNode>()
    let timer: ReturnType<typeof setTimeout> | undefined

    const rest = (node: AudioWorkletNode) => {
        const context = node.context
        let mine = rests.get(context)
        if (!mine) rests.set(context, (mine = { into: context.createGain(), held: 0, full: [] }))
        if (mine.held >= PER_REST) {
            mine.full.push(mine.into)
            mine.into = context.createGain()
            mine.held = 0
        }
        connect.call(node, mine.into)
        mine.held++
    }

    const turn = () => {
        timer = undefined
        for (const node of ended) {
            try {
                rest(node)
            } catch {
                // Its context is closed, and nothing works through it any more.
            }
        }
        ended = unplugged
        unplugged = new Set()
        if (ended.size) timer = setTimeout(turn, WAIT)
    }

    AudioNode.prototype.disconnect = function (this: AudioNode, ...args: any[]) {
        disconnect.apply(this, args)
        if (this instanceof AudioWorkletNode && this.numberOfOutputs) {
            unplugged.add(this)
            if (!timer) timer = setTimeout(turn, WAIT)
        }
    } as typeof AudioNode.prototype.disconnect
}
