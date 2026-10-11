import { toggleMute } from './edits'
import type { PatternBlock, TextEdit } from './types'

// A scene is a set of patterns that play together, under a name: what is on in the verse, what
// in the drop. It is written into the song as a line of its own, so that it goes wherever the
// song goes, into a file, to the site and to the other person in a jam:
//
//   // scene drop: kick rumble hats acid
//
// To the sound engine that is a remark and nothing more. Choosing a scene switches every
// pattern on or off, the way the M on each of them does.
export type Scene = { name: string; on: string[]; from: number; to: number }

const LINE = /^[ \t]*\/\/[ \t]*scene[ \t]+([^:\n]+?)[ \t]*:[ \t]*([^\n]*)$/gm
export const SCENE_NAME_LIMIT = 24

export const cleanSceneName = (text: string): string => text.replace(/[:\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, SCENE_NAME_LIMIT)

export function readScenes(code: string): Scene[] {
    const scenes: Scene[] = []
    for (const found of code.matchAll(LINE)) {
        const name = cleanSceneName(found[1])
        if (!name || scenes.some((scene) => scene.name === name)) continue
        scenes.push({ name, on: found[2].trim().split(/\s+/).filter(Boolean), from: found.index, to: found.index + found[0].length })
    }
    return scenes
}

const lineOf = (name: string, on: string[]) => `// scene ${name}: ${on.join(' ')}`

// The patterns that play now, as a scene. It goes after the last scene there is, or else in
// front of the first pattern.
export function keepScene(code: string, blocks: PatternBlock[], name: string): TextEdit | null {
    const scenes = readScenes(code)
    const clean = cleanSceneName(name)
    if (!clean || !blocks.length || scenes.some((scene) => scene.name === clean)) return null
    const line = lineOf(clean, [...new Set(blocks.filter((block) => !block.muted).map((block) => block.id))])
    const last = scenes[scenes.length - 1]
    if (last) return { from: last.to, to: last.to, insert: `\n${line}` }
    const first = Math.min(...blocks.map((block) => block.from))
    return { from: first, to: first, insert: `${line}\n\n` }
}

export const freeSceneName = (scenes: Scene[]): string => {
    for (let count = scenes.length + 1; ; count++) if (!scenes.some((scene) => scene.name === `Scene ${count}`)) return `Scene ${count}`
}

// With its line, a scene takes the line break before it, or the empty line after it when it
// was the only one.
export function dropScene(code: string, scene: Scene): TextEdit {
    if (code[scene.from - 1] === '\n' && readScenes(code).some((other) => other.to === scene.from - 1)) return { from: scene.from - 1, to: scene.to, insert: '' }
    const after = /^\n{1,2}/.exec(code.slice(scene.to))?.[0].length ?? 0
    return { from: scene.from, to: scene.to + after, insert: '' }
}

export function renameScene(code: string, scene: Scene, name: string): TextEdit | null {
    const clean = cleanSceneName(name)
    if (!clean || clean === scene.name || readScenes(code).some((other) => other.name === clean)) return null
    return { from: scene.from, to: scene.to, insert: lineOf(clean, scene.on) }
}

// What has to change in the code for exactly the patterns of the scene to play. A pattern the
// scene names that is no longer in the song is passed over.
export function sceneEdits(blocks: PatternBlock[], scene: Scene): TextEdit[] {
    const seen = new Set<string>()
    return blocks.flatMap((block) => {
        if (seen.has(block.id)) return []
        seen.add(block.id)
        return block.muted === !scene.on.includes(block.id) ? [] : [toggleMute(block)]
    })
}

export const sceneIsOn = (blocks: PatternBlock[], scene: Scene): boolean => blocks.length > 0 && sceneEdits(blocks, scene).length === 0
