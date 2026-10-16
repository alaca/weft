// The plugins that come with the app: sounds and effects written in Faust (plugins/*.dsp in the
// project), compiled into public/plugins/<name>/ by scripts/build-plugins.mjs. A plugin sound is
// played with s("name"), an effect is put on a pattern with .fx("name"). Each knob is a control
// of Strudel's named `fn`, read and written like any other, and `param` is the slider in the
// Faust code that it turns.

export type PluginKnob = { fn: string; param: string; label: string; min: number; max: number; initial: number; describe: string; unit?: string }
export type Plugin = { name: string; kind: 'sound' | 'effect'; label: string; about: string; knobs: PluginKnob[] }

export const PLUGINS: Plugin[] = [
    {
        name: 'pluck',
        kind: 'sound',
        label: 'Pluck',
        about: 'A plucked string',
        knobs: [
            { fn: 'damp', param: 'damp', label: 'Damping', min: 0, max: 1, initial: 0.3, describe: 'How quickly the string stops ringing' },
            { fn: 'bright', param: 'bright', label: 'Brightness', min: 0, max: 1, initial: 0.6, describe: 'How hard and close to the bridge the string is plucked' },
        ],
    },
    {
        name: 'epiano',
        kind: 'sound',
        label: 'Electric piano',
        about: 'An electric piano with a bell in its strike',
        knobs: [
            { fn: 'epbell', param: 'bell', label: 'Bell', min: 0, max: 1, initial: 0.4, describe: 'How bright and bell-like each note starts' },
            { fn: 'eptime', param: 'time', label: 'Ring time', min: 0.3, max: 8, initial: 2, describe: 'How long a held note rings', unit: 's' },
            { fn: 'eptrem', param: 'trem', label: 'Tremolo', min: 0, max: 1, initial: 0.2, describe: 'How much the level wavers, as through an old amplifier' },
        ],
    },
    {
        name: 'ladder',
        kind: 'sound',
        label: 'Ladder bass',
        about: 'A bass through a resonant ladder filter that opens on each note',
        knobs: [
            { fn: 'ladcut', param: 'cutoff', label: 'Cutoff', min: 0, max: 1, initial: 0.3, describe: 'How open the filter stands between notes' },
            { fn: 'ladres', param: 'res', label: 'Resonance', min: 0, max: 1, initial: 0.5, describe: 'How much the filter rings and squelches' },
            { fn: 'ladsweep', param: 'sweep', label: 'Sweep', min: 0, max: 1, initial: 0.5, describe: 'How far the filter opens on each note' },
            { fn: 'laddrive', param: 'drive', label: 'Drive', min: 0, max: 1, initial: 0.3, describe: 'How hard the filter is driven into distortion' },
        ],
    },
    {
        name: 'mallets',
        kind: 'sound',
        label: 'Marimba',
        about: 'A wooden bar over a tube, struck with a mallet',
        knobs: [
            { fn: 'mallet', param: 'mallet', label: 'Mallet', min: 0, max: 1, initial: 0.5, describe: 'How hard the mallet is, from soft yarn to bare wood' },
            { fn: 'barspot', param: 'spot', label: 'Strike spot', min: 0, max: 4, initial: 1, describe: 'Where on the bar the mallet lands' },
        ],
    },
    {
        name: 'wah',
        kind: 'effect',
        label: 'Wah',
        about: 'A wah pedal that rocks back and forth by itself',
        knobs: [
            { fn: 'wahspeed', param: 'speed', label: 'Wah speed', min: 0.1, max: 10, initial: 2, describe: 'How many times a second the pedal rocks', unit: 'Hz' },
            { fn: 'wahdepth', param: 'depth', label: 'Wah depth', min: 0, max: 1, initial: 0.8, describe: 'How far the pedal goes' },
            { fn: 'wahmix', param: 'mix', label: 'Wah mix', min: 0, max: 1, initial: 1, describe: 'How much of the sound goes through the wah' },
        ],
    },
    {
        name: 'tape',
        kind: 'effect',
        label: 'Tape echo',
        about: 'An echo whose repeats darken and wobble, as on old tape',
        knobs: [
            { fn: 'tapetime', param: 'time', label: 'Tape time', min: 0.02, max: 1.5, initial: 0.35, describe: 'How long until each repeat', unit: 's' },
            { fn: 'tapefeed', param: 'feedback', label: 'Tape repeats', min: 0, max: 0.95, initial: 0.45, describe: 'How long the repeats keep coming' },
            { fn: 'tapewow', param: 'wow', label: 'Tape wobble', min: 0, max: 1, initial: 0.3, describe: 'How much the tape speed drifts' },
            { fn: 'tapemix', param: 'mix', label: 'Tape mix', min: 0, max: 1, initial: 0.35, describe: 'How loud the echo is beside the sound' },
        ],
    },
    {
        name: 'hall',
        kind: 'effect',
        label: 'Hall',
        about: 'A long, smooth reverb of a large hall',
        knobs: [
            { fn: 'halldecay', param: 'decay', label: 'Hall decay', min: 0.5, max: 12, initial: 3, describe: 'How long the hall rings on', unit: 's' },
            { fn: 'hallwait', param: 'wait', label: 'Hall wait', min: 0, max: 120, initial: 30, describe: 'How long before the hall answers', unit: 'ms' },
            { fn: 'halldark', param: 'dark', label: 'Hall darkness', min: 0, max: 1, initial: 0.4, describe: 'How quickly the high end dies in the hall' },
            { fn: 'hallmix', param: 'mix', label: 'Hall mix', min: 0, max: 1, initial: 0.35, describe: 'How loud the hall is beside the sound' },
        ],
    },
    {
        name: 'flanger',
        kind: 'effect',
        label: 'Flanger',
        about: 'The sound beside a copy of itself a moment late, the gap sweeping',
        knobs: [
            { fn: 'flangespeed', param: 'speed', label: 'Flanger speed', min: 0.02, max: 5, initial: 0.3, describe: 'How many sweeps a second', unit: 'Hz' },
            { fn: 'flangedepth', param: 'depth', label: 'Flanger depth', min: 0, max: 1, initial: 0.7, describe: 'How strong the sweep is' },
            { fn: 'flangefeed', param: 'feedback', label: 'Flanger ring', min: 0, max: 0.95, initial: 0.5, describe: 'How much the sweep rings, metallic at the top' },
            { fn: 'flangemix', param: 'mix', label: 'Flanger mix', min: 0, max: 1, initial: 0.6, describe: 'How much of the sound goes through the flanger' },
        ],
    },
    {
        name: 'shift',
        kind: 'effect',
        label: 'Pitch shift',
        about: 'The sound moved up or down by semitones, beside itself',
        knobs: [
            { fn: 'shiftsemis', param: 'semitones', label: 'Shift', min: -24, max: 24, initial: 12, describe: 'How many semitones up, or down below zero' },
            { fn: 'shiftmix', param: 'mix', label: 'Shift mix', min: 0, max: 1, initial: 0.5, describe: 'How loud the shifted sound is beside the sound' },
        ],
    },
]

export const pluginNamed = (name: string | undefined | null): Plugin | undefined => PLUGINS.find((plugin) => plugin.name === name)
export const PLUGIN_SOUNDS = PLUGINS.filter((plugin) => plugin.kind === 'sound')
export const PLUGIN_EFFECTS = PLUGINS.filter((plugin) => plugin.kind === 'effect')
// The call that puts an effect on a pattern.
export const EFFECT_CALL = 'fx'
