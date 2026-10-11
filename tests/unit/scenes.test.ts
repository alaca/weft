import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { dropScene, freeSceneName, keepScene, readScenes, renameScene, sceneEdits, sceneIsOn } from '../../src/song/scenes'

const SONG = `// A song
setcpm(120/4)

drums: s("bd*4")

_bass: note("c2 e2")
  .s("sawtooth")

lead: note("c4")
`
const apply = (code: string, edits: { from: number; to: number; insert: string }[]) => [...edits].sort((a, b) => b.from - a.from).reduce((text, edit) => text.slice(0, edit.from) + edit.insert + text.slice(edit.to), code)
const blocks = (code: string) => analyze(code).patterns
const keep = (code: string, name: string) => apply(code, [keepScene(code, blocks(code), name)!])

describe('scenes', () => {
    it('are kept as lines of the song, in front of its first pattern, each with the patterns that play', () => {
        const one = keep(SONG, 'verse')
        expect(one).toContain('setcpm(120/4)\n\n// scene verse: drums lead\n\ndrums: s("bd*4")')
        expect(analyze(one).error).toBeNull()
        const unmuted = apply(one, sceneEdits(blocks(one), { name: 'all', on: ['drums', 'bass', 'lead'], from: 0, to: 0 }))
        const two = keep(unmuted, 'drop')
        expect(two).toContain('// scene verse: drums lead\n// scene drop: drums bass lead\n\ndrums:')
        expect(readScenes(two).map((scene) => [scene.name, scene.on])).toEqual([
            ['verse', ['drums', 'lead']],
            ['drop', ['drums', 'bass', 'lead']],
        ])
    })

    it('take a name once, and a new one is given the next free number', () => {
        const one = keep(SONG, 'verse')
        expect(keepScene(one, blocks(one), 'verse')).toBeNull()
        expect(keepScene(one, blocks(one), '  ')).toBeNull()
        expect(freeSceneName(readScenes(one))).toBe('Scene 2')
        expect(freeSceneName(readScenes(keep(one, 'Scene 2')))).toBe('Scene 3')
    })

    it('switch every pattern on or off so that exactly theirs play, and say when that is already so', () => {
        const code = keep(SONG, 'verse')
        const drop = { name: 'drop', on: ['bass', 'gone'], from: 0, to: 0 }
        expect(sceneIsOn(blocks(code), readScenes(code)[0])).toBe(true)
        expect(sceneIsOn(blocks(code), drop)).toBe(false)
        const next = apply(code, sceneEdits(blocks(code), drop))
        expect(next).toContain('_drums: s("bd*4")')
        expect(next).toContain('\nbass: note("c2 e2")')
        expect(next).toContain('_lead: note("c4")')
        expect(sceneIsOn(blocks(next), drop)).toBe(true)
    })

    it('are renamed and taken out again, leaving the song as it was', () => {
        const one = keep(SONG, 'verse')
        const two = keep(one, 'drop')
        const renamed = apply(two, [renameScene(two, readScenes(two)[1], 'the drop: loud')!])
        expect(renamed).toContain('// scene the drop loud: drums lead')
        expect(renameScene(two, readScenes(two)[1], 'verse')).toBeNull()
        const back = apply(two, [dropScene(two, readScenes(two)[1])])
        expect(back).toBe(one)
        expect(apply(one, [dropScene(one, readScenes(one)[0])])).toBe(SONG)
    })
})
