import type { PatternBlock } from '../song/types'
import { callFor } from './views'

export type Envelope = { attack: number; decay: number; sustain: number; release: number }

const HOLD = 0.3

function valueOf(block: PatternBlock, fn: string): number | null {
    const arg = callFor(block, fn)?.args[0]
    return arg && (arg.kind === 'number' || arg.kind === 'slider') ? arg.value : null
}

export function envelopeOf(block: PatternBlock): Envelope {
    const attack = valueOf(block, 'attack')
    const decay = valueOf(block, 'decay')
    const sustain = valueOf(block, 'sustain')
    const release = valueOf(block, 'release')
    if (attack === null && decay === null && sustain === null && release === null) {
        return { attack: 0.001, decay: 0.001, sustain: 1, release: 0.01 }
    }
    const held = sustain !== null ? sustain : decay === null ? 1 : 0.001
    return {
        attack: Math.max(attack ?? 0, 0.001),
        decay: Math.max(decay ?? 0, 0.001),
        sustain: Math.min(held, 1),
        release: Math.max(release ?? 0, 0.01),
    }
}

export function envelopePoints(envelope: Envelope, width: number, height: number): [number, number][] {
    const span = (seconds: number) => Math.min(1, Math.max(0.03, seconds))
    const parts = [span(envelope.attack), span(envelope.decay), HOLD, span(envelope.release)]
    const total = parts.reduce((sum, part) => sum + part, 0)
    const top = 2
    const floor = height - 1
    const level = floor - envelope.sustain * (floor - top)
    const x = (upTo: number) => (parts.slice(0, upTo).reduce((sum, part) => sum + part, 0) / total) * width
    return [
        [0, floor],
        [x(1), top],
        [x(2), level],
        [x(3), level],
        [width, floor],
    ]
}
