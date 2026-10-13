import { describe, expect, it } from 'vitest'
import { checkSong } from '../../src/guard/check'
import { analyze } from '../../src/song/analyze'
import { applyEdits } from '../../src/song/edits'
import { LIBRARY, presetCalls, presetEdits, previewText, readPresets, withPreset, writePresets } from '../../src/sounds/presets'

const SONG = `setcpm(120/4)

bass: note("c2 ~ c2 e2").slow(2)
  .s("sawtooth")
  .lpf(slider(900, 100, 8000))
  .lpenv(3).decay(.18)
  .swingBy(slider(0.2, 0, 0.5), 8)
  .mul(postgain(slider(0.8, 0, 1.5)))
  .pan(slider(0.5, 0, 1))
  .mask("<1!4 0!4>")

keys: note("c4 e4")
  .mul(postgain(slider(1, 0, 1.5)))
`

const block = (code: string, id: string) => analyze(code).patterns.find((pattern) => pattern.id === id)!

describe('a preset', () => {
    it('is the sound of a pattern: what plays it and what shapes it, not its mix, its feel or its bars', () => {
        expect(presetCalls(SONG, block(SONG, 'bass'))).toEqual(['.s("sawtooth")', '.lpf(slider(900, 100, 8000))', '.lpenv(3)', '.decay(.18)'])
    })

    it('takes the place of the sound a pattern has, and leaves the rest of the pattern as it was', () => {
        const calls = ['.s("square")', '.lpf(slider(700, 100, 8000))']
        const next = applyEdits(SONG, presetEdits(SONG, block(SONG, 'bass'), calls))
        expect(next).toContain('bass: note("c2 ~ c2 e2").slow(2)\n  .s("square")\n  .lpf(slider(700, 100, 8000))\n  .swingBy(slider(0.2, 0, 0.5), 8)\n  .mul(postgain(slider(0.8, 0, 1.5)))\n  .pan(slider(0.5, 0, 1))\n  .mask("<1!4 0!4>")')
        expect(analyze(next).error).toBeNull()
        expect(presetCalls(next, block(next, 'bass'))).toEqual(calls)
    })

    it('goes straight after the notes of a pattern that has no sound yet', () => {
        const next = applyEdits(SONG, presetEdits(SONG, block(SONG, 'keys'), ['.s("piano")', '.room(slider(0.3, 0, 1))']))
        expect(next).toContain('keys: note("c4 e4")\n  .s("piano")\n  .room(slider(0.3, 0, 1))\n  .mul(postgain(slider(1, 0, 1.5)))')
    })

    it('a knob that is drawn over the song stands still in the preset', () => {
        const drawn = SONG.replace('.lpf(slider(900, 100, 8000))', '.lpf("<400 800 1600 800>")')
        expect(presetCalls(drawn, block(drawn, 'bass'))[1]).toBe('.lpf(slider(1600, 100, 8000))')
    })

    it('is tried out as one note, with each slider as the number it stands on', () => {
        expect(previewText(['.s("sawtooth")', '.lpf(slider(900, 100, 8000))', '.decay(slider(0.2, 0, 2))'], 36)).toBe('note(36).s("sawtooth").lpf(900).decay(0.2)')
    })
})

describe('the presets the app comes with', () => {
    it('have a name of their own each, a sound, and nothing in them but music code', () => {
        expect(new Set(LIBRARY.map((preset) => preset.id)).size).toBe(LIBRARY.length)
        for (const preset of LIBRARY) {
            expect(preset.calls[0], preset.name).toMatch(/^\.s\("[a-z_0-9]+"\)$/)
            expect(preset.calls.length, preset.name).toBeGreaterThan(1)
            expect(checkSong(previewText(preset.calls, preset.pitch ?? 60)), preset.name).toBeNull()
            const song = `lead: note("c4")${preset.calls.join('')}`
            expect(presetCalls(song, block(song, 'lead')), preset.name).toEqual(preset.calls)
        }
    })
})

describe('presets of your own', () => {
    it('are kept as a name and the calls, and one saved under a name that is taken replaces it', () => {
        const first = withPreset([], 'My bass', ['.s("sine")'])
        const both = withPreset(first, 'Air', ['.s("triangle")', '.room(slider(0.5, 0, 1))'])
        const again = withPreset(both, 'my bass', ['.s("square")'])
        expect(again.map((preset) => [preset.name, preset.calls[0]])).toEqual([['Air', '.s("triangle")'], ['my bass', '.s("square")']])
        expect(readPresets(writePresets(again))).toEqual(again)
    })

    it('what cannot be a preset is left out when they are read', () => {
        expect(readPresets('not json')).toEqual([])
        expect(readPresets(JSON.stringify([{ name: '', calls: ['.s("sine")'] }, { name: 'Empty', calls: [] }, { name: 'Odd', calls: ['alert(1)', 4] }, { name: 'Fine', calls: ['.s("sine")'] }])).map((preset) => preset.name)).toEqual(['Fine'])
    })
})
