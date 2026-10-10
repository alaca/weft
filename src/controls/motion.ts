import type { Call } from '../song/types'

// A value that moves by itself over a number of bars, in place of a knob that stays where it is
// put: sine.range(500, 2600).slow(16) goes from one end to the other and back, and
// saw.range(200, 4000).slow(4) goes one way and starts again.
export type MotionShape = 'sine' | 'saw'
export type Motion = { shape: MotionShape; from: number; to: number; bars: number }

export const MOTION_SHAPES: { id: MotionShape; label: string }[] = [
    { id: 'sine', label: 'Back and forth' },
    { id: 'saw', label: 'One way' },
]
export const MOTION_BARS = [1, 2, 4, 8, 16]

const number = (call: Call | undefined, at: number): number | null => {
    const arg = call?.args[at]
    return arg && arg.kind === 'number' ? arg.value : null
}

// What moves the value of a call, when its code is written the way the app writes it. `isaw`
// falls where `saw` rises, which is the same as going one way between the ends turned round.
export function readMotion(call: Call | undefined): Motion | null {
    const arg = call?.args[0]
    if (!arg || arg.kind !== 'chain' || !arg.root || arg.calls.length < 1 || arg.calls.length > 2) return null
    const [range, slow] = arg.calls
    const low = number(range, 0)
    const high = number(range, 1)
    const bars = slow ? number(slow, 0) : 1
    if (range.name !== 'range' || low === null || high === null || (slow && slow.name !== 'slow') || bars === null || bars <= 0) return null
    if (arg.root === 'sine') return { shape: 'sine', from: low, to: high, bars }
    if (arg.root === 'saw') return { shape: 'saw', from: low, to: high, bars }
    if (arg.root === 'isaw') return { shape: 'saw', from: high, to: low, bars }
    return null
}

export const motionText = (motion: Motion, write: (value: number) => string): string =>
    `${motion.shape}.range(${write(motion.from)}, ${write(motion.to)})${motion.bars === 1 ? '' : `.slow(${motion.bars})`}`

// The motion a knob starts with: up to where the knob stood, from a quarter of the way there.
export function firstMotion(value: number, min: number, max: number): Motion {
    const to = value > min ? value : min + (max - min) / 2
    return { shape: 'sine', from: min + (to - min) / 4, to, bars: 4 }
}
