import type { PatternBlock } from '../song/types'

export type Group = 'source' | 'filter' | 'shape' | 'effects' | 'pattern'
export type PanelGroup = Exclude<Group, 'pattern'>
export type Scale = 'linear' | 'log'
export type SoundKind = 'synth' | 'sample'

export type ControlDef = {
    fn: string
    names: string[]
    label: string
    group: Group
    min: number
    max: number
    initial: number
    scale: Scale
    unit: string
    describe: string
}

type Extra = Partial<Pick<ControlDef, 'names' | 'scale' | 'unit'>>

const control = (fn: string, label: string, group: Group, min: number, max: number, initial: number, describe: string, extra: Extra = {}): ControlDef => ({
    fn,
    names: [fn],
    label,
    group,
    min,
    max,
    initial,
    scale: 'linear',
    unit: '',
    describe,
    ...extra,
})

export const CONTROLS: ControlDef[] = [
    control('vib', 'Vibrato', 'source', 0, 12, 4, 'How fast the pitch wobbles', { names: ['vib', 'vibrato', 'v'], unit: 'Hz' }),
    control('vibmod', 'Vibrato depth', 'source', 0, 2, 0.5, 'How far the pitch wobbles, in semitones', { names: ['vibmod', 'vmod'] }),
    control('noise', 'Noise', 'source', 0, 1, 0.2, 'Mixes hiss into the tone'),
    control('fm', 'Metal', 'source', 0, 8, 2, 'Bell-like, metallic overtones', { names: ['fm', 'fmi'] }),
    control('fmh', 'Metal ratio', 'source', 0.5, 8, 2, 'Changes which overtones the metal has'),
    control('speed', 'Speed', 'source', 0.25, 2, 1, 'Plays the sample faster and higher, or slower and lower'),
    control('begin', 'Start', 'source', 0, 1, 0, 'Where in the sample playback begins'),
    control('penv', 'Pitch sweep', 'source', -24, 24, 12, 'Bends the pitch as each note starts'),
    control('lpf', 'Cutoff', 'filter', 100, 8000, 1200, 'Cuts everything above this pitch', { names: ['lpf', 'cutoff', 'ctf', 'lp'], scale: 'log', unit: 'Hz' }),
    control('lpq', 'Resonance', 'filter', 0, 30, 8, 'How much the filter rings at its cutoff', { names: ['lpq', 'resonance'] }),
    control('lpenv', 'Sweep', 'filter', 0, 8, 3, 'How far the filter opens on each note', { names: ['lpenv', 'lpe'] }),
    control('lpdecay', 'Sweep time', 'filter', 0, 1, 0.2, 'How quickly the filter closes again', { names: ['lpdecay', 'lpd'], unit: 's' }),
    control('hpf', 'Low cut', 'filter', 20, 4000, 300, 'Cuts everything below this pitch', { names: ['hpf', 'hp', 'hcutoff'], scale: 'log', unit: 'Hz' }),
    control('attack', 'Attack', 'shape', 0, 1, 0.01, 'How slowly each note fades in', { names: ['attack', 'att'], unit: 's' }),
    control('decay', 'Decay', 'shape', 0, 2, 0.2, 'How quickly each note falls to its held level', { names: ['decay', 'dec'], unit: 's' }),
    control('sustain', 'Hold', 'shape', 0, 1, 0.5, 'The level a note stays at while it is held', { names: ['sustain', 'sus'] }),
    control('release', 'Release', 'shape', 0, 2, 0.2, 'How slowly a note fades out after it ends', { names: ['release', 'rel'], unit: 's' }),
    control('delay', 'Delay', 'effects', 0, 1, 0.25, 'How much of the sound is sent to the echo'),
    control('delayfeedback', 'Echo feedback', 'effects', 0, 0.9, 0.5, 'How long the echoes keep going', { names: ['delayfeedback', 'delayfb', 'dfb'] }),
    control('pan', 'Pan', 'effects', 0, 1, 0.5, 'Left, right, or anywhere between'),
    control('room', 'Room', 'effects', 0, 1, 0.3, 'How much reverb is added'),
    control('roomsize', 'Room size', 'effects', 0, 10, 2, 'How large the reverb space sounds', { names: ['roomsize', 'size', 'sz', 'rsize'] }),
    control('distort', 'Drive', 'effects', 0, 5, 1, 'Overdrives the sound', { names: ['distort', 'dist'] }),
    control('crush', 'Crush', 'effects', 1, 16, 8, 'Gritty, low-resolution digital sound'),
    control('coarse', 'Coarse', 'effects', 1, 32, 4, 'Lowers the sample rate for a rough sound'),
    control('phaser', 'Phaser', 'effects', 0, 8, 1, 'A slow, sweeping swirl', { names: ['phaser', 'ph'] }),
    control('gain', 'Volume', 'effects', 0, 1.5, 0.8, 'How loud this pattern is'),
    control('degradeBy', 'Skip hits', 'pattern', 0, 1, 0.15, 'Leaves out this share of the hits at random'),
]

export const STARTERS: Record<SoundKind, Record<PanelGroup, string[]>> = {
    synth: {
        source: ['vib', 'noise', 'fm'],
        filter: ['lpf', 'lpq', 'lpenv'],
        shape: ['attack', 'decay', 'sustain', 'release'],
        effects: ['delay', 'pan', 'room'],
    },
    sample: {
        source: ['speed', 'begin'],
        filter: ['lpf', 'lpq', 'lpenv'],
        shape: ['attack', 'decay', 'sustain', 'release'],
        effects: ['delay', 'pan', 'room'],
    },
}

const SYNTHS = ['sine', 'triangle', 'square', 'sawtooth', 'supersaw', 'pulse']
const SOUND_CALLS = ['s', 'sound', 'bank']

export const findDef = (name: string): ControlDef | undefined => CONTROLS.find((def) => def.names.includes(name))

export function soundKind(block: PatternBlock): SoundKind {
    if (block.soundName) return SYNTHS.includes(block.soundName) ? 'synth' : 'sample'
    return block.calls.some((call) => SOUND_CALLS.includes(call.name)) ? 'sample' : 'synth'
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

export function toUnit(value: number, min: number, max: number, scale: Scale): number {
    if (max === min) return 0
    if (scale === 'log' && min > 0) return clamp01(Math.log(Math.max(value, min) / min) / Math.log(max / min))
    return clamp01((value - min) / (max - min))
}

export function fromUnit(unit: number, min: number, max: number, scale: Scale): number {
    if (scale === 'log' && min > 0) return min * Math.pow(max / min, unit)
    return min + (max - min) * unit
}

export function writeNumber(value: number, min: number, max: number): string {
    const span = max - min
    const digits = span >= 100 ? 0 : span >= 10 ? 1 : 2
    return String(Number(value.toFixed(digits)))
}
