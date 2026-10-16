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
]

export const pluginNamed = (name: string | undefined | null): Plugin | undefined => PLUGINS.find((plugin) => plugin.name === name)
export const PLUGIN_SOUNDS = PLUGINS.filter((plugin) => plugin.kind === 'sound')
export const PLUGIN_EFFECTS = PLUGINS.filter((plugin) => plugin.kind === 'effect')
// The call that puts an effect on a pattern.
export const EFFECT_CALL = 'fx'
