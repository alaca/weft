import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PLUGINS } from '../../src/plugins/list'

type Item = { type: string; label: string; min?: number; max?: number; init?: number; items?: Item[] }
const sliders = (items: Item[]): Item[] => items.flatMap((item) => (item.items ? sliders(item.items) : [item]))

// The list of plugins is written by hand beside the Faust code; what Faust made of that code is
// the truth, and the two have to agree on every knob.
describe('the plugins that come with the app', () => {
    for (const plugin of PLUGINS) {
        it(`${plugin.name} has the knobs its list says, as Faust compiled them`, () => {
            const meta = JSON.parse(readFileSync(new URL(`../../public/plugins/${plugin.name}/dsp-meta.json`, import.meta.url), 'utf8'))
            const made = sliders(meta.ui)
            for (const knob of plugin.knobs) {
                const slider = made.find((item) => item.label === knob.param)
                expect([knob.fn, slider?.min, slider?.max, slider?.init]).toEqual([knob.fn, knob.min, knob.max, knob.initial])
            }
            if (plugin.kind === 'sound') {
                expect(['freq', 'gain', 'gate'].every((name) => made.some((item) => item.label === name))).toBe(true)
                expect([meta.inputs, meta.outputs]).toEqual([0, 2])
            } else {
                expect([meta.inputs, meta.outputs]).toEqual([2, 2])
            }
        })
    }
})
