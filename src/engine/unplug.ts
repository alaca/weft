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

const rests = new WeakMap<BaseAudioContext, Rest>()

// How many worklet nodes have been put to rest on an audio clock. That is nearly every one it
// has had made on it, and it keeps what each of them took until it is closed.
export function restedOn(context: BaseAudioContext): number {
    const mine = rests.get(context)
    return mine ? mine.full.length * PER_REST + mine.held : 0
}

// A node that is given from one note to the next (see ownWorklets.ts) is not put to rest but
// kept, by what it is, until a note asks for one the same. It waits plugged into a place that
// nothing listens to, so that it costs nothing meanwhile.
type Kept = { into: GainNode; waiting: Map<string, AudioWorkletNode[]> }

const kinds = new WeakMap<AudioWorkletNode, string>()
const kept = new WeakMap<BaseAudioContext, Kept>()
const waiting = new WeakSet<AudioWorkletNode>()
let plain: { connect: (this: AudioNode, to: AudioNode) => AudioNode; disconnect: (this: AudioNode, ...args: any[]) => void } | null = null

export const canKeep = () => plain !== null

export function keepWhenUnplugged(node: AudioWorkletNode, kind: string) {
    kinds.set(node, kind)
}

// One that waits, with every setting back where it was when the node was made.
export function takeKept(context: BaseAudioContext, kind: string): AudioWorkletNode | undefined {
    const mine = kept.get(context)
    const node = mine?.waiting.get(kind)?.pop()
    if (!mine || !node || !plain) return undefined
    waiting.delete(node)
    plain.disconnect.call(node, mine.into)
    node.parameters.forEach((param) => {
        param.cancelScheduledValues(0)
        param.value = param.defaultValue
    })
    return node
}

function keep(node: AudioWorkletNode, kind: string) {
    if (waiting.has(node) || !plain) return
    const context = node.context
    let mine = kept.get(context)
    if (!mine) kept.set(context, (mine = { into: context.createGain(), waiting: new Map() }))
    try {
        plain.connect.call(node, mine.into)
    } catch {
        // Its context is closed, and the node is gone with it.
        return
    }
    waiting.add(node)
    const same = mine.waiting.get(kind)
    if (same) same.push(node)
    else mine.waiting.set(kind, [node])
}

let done = false

export function restUnpluggedWorklets() {
    if (done || typeof AudioWorkletNode === 'undefined') return
    done = true
    const connect = AudioNode.prototype.connect as (this: AudioNode, to: AudioNode) => AudioNode
    const disconnect = AudioNode.prototype.disconnect as (this: AudioNode, ...args: any[]) => void
    plain = { connect, disconnect }
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
        if (!(this instanceof AudioWorkletNode) || !this.numberOfOutputs) return
        const kind = kinds.get(this)
        if (kind !== undefined) {
            if (!args.length) keep(this, kind)
            return
        }
        unplugged.add(this)
        if (!timer) timer = setTimeout(turn, WAIT)
    } as typeof AudioNode.prototype.disconnect
}
