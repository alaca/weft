import { CONTROLS, controlText, findDef, MIX_CONTROLS, type ControlDef } from '../controls/catalog'
import { controlOf } from '../controls/views'
import { removeCall } from '../song/edits'
import type { Call, PatternBlock, TextEdit } from '../song/types'

// A preset is the sound of a pattern that plays notes, as it stands in the code: what plays it
// and everything that shapes it. How loud the pattern is and where it sits, how it is played
// (swing, skipped hits), the pump and the bars it plays in belong to the song, and stay out.
export type PresetKind = 'bass' | 'lead' | 'pad' | 'pluck' | 'keys'
export type Preset = {
    id: string
    name: string
    // Each call as it is written, from its dot to its closing bracket.
    calls: string[]
    kind?: PresetKind
    // The note it is tried out on, where no pattern says another.
    pitch?: number
    own?: boolean
}

export const KIND_LABELS: Record<PresetKind, string> = { bass: 'Bass', lead: 'Lead', pad: 'Pad', pluck: 'Pluck', keys: 'Keys' }

const NAMING = ['s', 'sound']
// What shapes a sound without being one of the knobs.
const ALSO = ['n', 'delaysync', 'delaytime', 'unison', 'spread', 'detune', 'lpattack', 'lpsustain', 'lprelease', 'fmattack', 'fmsustain', 'fmenv', 'ftype', 'vowel', 'shape']

function shapes(call: Call): boolean {
    if (NAMING.includes(call.name) || ALSO.includes(call.name)) return true
    const def = findDef(call.name)
    return Boolean(def) && def!.group !== 'pattern' && !MIX_CONTROLS.includes(def!.fn) && def!.needs !== 'duckorbit'
}

// The calls of a pattern that are its sound. The first call of a pattern is what it plays.
export const soundCalls = (block: PatternBlock): Call[] => block.calls.slice(1).filter(shapes)

// A knob that is drawn over the song is written bar by bar, for that song. In a preset it stands
// still, where it stood highest.
function textOf(code: string, block: PatternBlock, call: Call): string {
    const def = findDef(call.name)
    if (def && !def.wrap && !def.call) {
        const view = controlOf(block, def.fn)
        if (view.state === 'drawn') return controlText(def, view.value)
    }
    return code.slice(call.from, call.to).trim()
}

export const presetCalls = (code: string, block: PatternBlock): string[] => soundCalls(block).map((call) => textOf(code, block, call))

const indentOf = (code: string, block: PatternBlock): string => {
    const lines = code.slice(block.from, block.to).split('\n')
    return (lines.length > 1 ? /^[ \t]*/.exec(lines[1])?.[0] : '') || '  '
}

// The pattern keeps what it plays and takes the sound of the preset in place of its own.
export function presetEdits(code: string, block: PatternBlock, calls: string[]): TextEdit[] {
    const indent = indentOf(code, block)
    const text = calls.map((call) => `\n${indent}${call}`).join('')
    const old = soundCalls(block)
    if (old.length) return [{ from: old[0].from, to: old[0].to, insert: text }, ...old.slice(1).map(removeCall)]
    // No sound of its own yet: the new one goes straight after what it plays and how long that is.
    const head = block.calls[1]?.name === 'slow' || block.calls[1]?.name === 'fast' ? block.calls[1] : block.calls[0]
    return [{ from: head.to, to: head.to, insert: text }]
}

const SLIDER = /slider\(\s*(-?\d*\.?\d+)\s*,\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*\)/g

// One note of a preset as code that can be played by itself. A slider is a part of the editor,
// so each stands as the number it is on.
export const previewText = (calls: string[], pitch: number): string => `note(${pitch})${calls.join('').replace(SLIDER, '$1')}`

export const PREVIEW_PITCH = 60

type Recipe = { name: string; kind: PresetKind; pitch: number; s: string; knobs: Record<string, number> }

// The sounds the app comes with. Each is written with the app's own knobs, so every part of it
// can be turned once it is the sound of a pattern.
const RECIPES: Recipe[] = [
    { name: 'Acid bass', kind: 'bass', pitch: 36, s: 'sawtooth', knobs: { lpf: 500, lpq: 18, lpenv: 4.5, lpdecay: 0.18, decay: 0.2, sustain: 0.2, release: 0.08, distort: 0.6 } },
    { name: 'Sub bass', kind: 'bass', pitch: 33, s: 'sine', knobs: { attack: 0.01, decay: 0.3, sustain: 0.9, release: 0.12, distort: 0.3 } },
    { name: 'Reese bass', kind: 'bass', pitch: 33, s: 'supersaw', knobs: { lpf: 420, lpq: 6, attack: 0.02, sustain: 0.9, release: 0.15, phaser: 0.5 } },
    { name: 'Rubber bass', kind: 'bass', pitch: 36, s: 'square', knobs: { lpf: 700, lpq: 8, lpenv: 2.5, lpdecay: 0.12, decay: 0.25, sustain: 0.4, release: 0.1 } },
    { name: 'FM bass', kind: 'bass', pitch: 36, s: 'sine', knobs: { fm: 3, fmh: 1, fmdecay: 0.15, decay: 0.3, sustain: 0.5, release: 0.1 } },
    { name: 'Square lead', kind: 'lead', pitch: 72, s: 'square', knobs: { vib: 5.5, vibmod: 0.15, lpf: 3200, lpq: 4, attack: 0.01, release: 0.15, delay: 0.25, delayfeedback: 0.4 } },
    { name: 'Saw lead', kind: 'lead', pitch: 72, s: 'sawtooth', knobs: { lpf: 2600, lpq: 6, lpenv: 2, attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.2, delay: 0.2, room: 0.2 } },
    { name: 'Supersaw lead', kind: 'lead', pitch: 72, s: 'supersaw', knobs: { lpf: 4500, attack: 0.02, release: 0.3, delay: 0.2, room: 0.35 } },
    { name: 'Whistle', kind: 'lead', pitch: 79, s: 'sine', knobs: { vib: 5, vibmod: 0.2, noise: 0.05, attack: 0.05, release: 0.2, delay: 0.3, room: 0.4 } },
    { name: 'Warm pad', kind: 'pad', pitch: 60, s: 'sawtooth', knobs: { lpf: 900, lpq: 2, attack: 0.6, decay: 0.8, sustain: 0.8, release: 1.4, chorus: 0.6, room: 0.5, roomsize: 4 } },
    { name: 'Supersaw pad', kind: 'pad', pitch: 60, s: 'supersaw', knobs: { lpf: 1800, attack: 0.5, release: 1.5, phaser: 0.6, room: 0.6, roomsize: 5 } },
    { name: 'Glass pad', kind: 'pad', pitch: 67, s: 'triangle', knobs: { fm: 1.2, fmh: 3, attack: 0.4, release: 1.6, delay: 0.3, chorus: 0.4, room: 0.7, roomsize: 6 } },
    { name: 'Strings', kind: 'pad', pitch: 60, s: 'gm_string_ensemble_1', knobs: { attack: 0.25, release: 0.9, room: 0.45 } },
    { name: 'Pluck', kind: 'pluck', pitch: 67, s: 'sawtooth', knobs: { lpf: 1800, lpq: 5, lpenv: 3.5, lpdecay: 0.12, decay: 0.18, sustain: 0, release: 0.15, delay: 0.3, delayfeedback: 0.45 } },
    { name: 'Bell', kind: 'pluck', pitch: 76, s: 'sine', knobs: { fm: 4, fmh: 3.5, fmdecay: 0.5, decay: 1.2, sustain: 0, release: 0.8, room: 0.5 } },
    { name: 'Kalimba', kind: 'pluck', pitch: 72, s: 'triangle', knobs: { fm: 1.5, fmh: 5, fmdecay: 0.08, decay: 0.35, sustain: 0, release: 0.3, room: 0.3 } },
    { name: 'Electric piano', kind: 'keys', pitch: 60, s: 'gm_epiano1', knobs: { phaser: 0.5, chorus: 0.4, room: 0.3 } },
    { name: 'Dusty piano', kind: 'keys', pitch: 60, s: 'piano', knobs: { lpf: 2400, crush: 10, room: 0.25 } },
    { name: 'Organ', kind: 'keys', pitch: 60, s: 'gm_drawbar_organ', knobs: { distort: 0.4, chorus: 0.5, room: 0.35 } },
    { name: 'FM keys', kind: 'keys', pitch: 60, s: 'sine', knobs: { fm: 2, fmh: 2, fmdecay: 0.3, decay: 0.8, sustain: 0.3, release: 0.4, chorus: 0.3, room: 0.25 } },
]

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

// The knobs of a recipe in the order the app's own list has them, which is the order a person
// meets them in a sound's panel.
const written = (recipe: Recipe): string[] => [
    `.s("${recipe.s}")`,
    ...CONTROLS.filter((def) => recipe.knobs[def.fn] !== undefined).map((def: ControlDef) => controlText(def, recipe.knobs[def.fn])),
]

export const LIBRARY: Preset[] = RECIPES.map((recipe) => ({ id: `lib:${slug(recipe.name)}`, name: recipe.name, kind: recipe.kind, pitch: recipe.pitch, calls: written(recipe) }))

// Presets of your own, as they are kept: a name and the calls. Anything else that is found
// where they are kept is left out.
export const NAME_MOST = 40
export const cleanPresetName = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, NAME_MOST)
export const ownId = (name: string) => `own:${name.toLowerCase()}`

export function readPresets(text: string | null): Preset[] {
    try {
        const kept = JSON.parse(text ?? '[]') as unknown
        if (!Array.isArray(kept)) return []
        return kept.flatMap((entry: { name?: unknown; calls?: unknown }) => {
            const name = typeof entry?.name === 'string' ? cleanPresetName(entry.name) : ''
            const calls = Array.isArray(entry?.calls) ? entry.calls.filter((call): call is string => typeof call === 'string' && call.startsWith('.')) : []
            return name && calls.length ? [{ id: ownId(name), name, calls, own: true }] : []
        })
    } catch {
        return []
    }
}

export const writePresets = (presets: Preset[]): string => JSON.stringify(presets.filter((preset) => preset.own).map(({ name, calls }) => ({ name, calls })))

// A preset saved under a name that is taken replaces the one that had it.
export function withPreset(presets: Preset[], name: string, calls: string[]): Preset[] {
    const id = ownId(name)
    return [...presets.filter((preset) => preset.id !== id), { id, name, calls, own: true }].sort((a, b) => a.name.localeCompare(b.name))
}
