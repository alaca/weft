import { MAX_BARS } from './bars'
import { readScenes } from './scenes'
import type { PatternBlock, TextEdit } from './types'

// A section is a stretch of the song's bars under a name: the intro, a verse, the drop. Each is a
// line of its own in the song, with its bars counted from 1 as the Song panel counts them, so
// that it goes wherever the song goes:
//
//   // section Intro: 1-8
//   // section Drop: 25-32
//
// To the sound engine it is a remark, and nothing plays any differently for it. Two sections
// may have one name, as a song has more than one verse. They never lie over each other.
export type Section = { name: string; from: number; to: number }
type Written = Section & { at: number; end: number }

const LINE = /^[ \t]*\/\/[ \t]*section[ \t]+([^:\n]+?)[ \t]*:[ \t]*(\d+)(?:[ \t]*-[ \t]*(\d+))?[ \t]*$/gm
export const SECTION_NAME_LIMIT = 24

export const cleanSectionName = (text: string): string => text.replace(/[:\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, SECTION_NAME_LIMIT)

function written(code: string): Written[] {
    const found: Written[] = []
    for (const line of code.matchAll(LINE)) {
        const name = cleanSectionName(line[1])
        const from = Number(line[2]) - 1
        const to = line[3] === undefined ? from + 1 : Number(line[3])
        if (!name || from < 0 || to <= from || to > MAX_BARS) continue
        found.push({ name, from, to, at: line.index, end: line.index + line[0].length })
    }
    return found
}

// The sections in the order of their bars. Where one was written over another, the one that
// starts later begins where the other ends.
export function readSections(code: string): Section[] {
    const sections: Section[] = []
    for (const { name, from, to } of [...written(code)].sort((a, b) => a.from - b.from || a.to - b.to)) {
        const start = Math.max(from, sections[sections.length - 1]?.to ?? 0)
        if (start < to) sections.push({ name, from: start, to })
    }
    return sections
}

const lineOf = (section: Section) => `// section ${section.name}: ${section.from + 1}${section.to - section.from > 1 ? `-${section.to}` : ''}`

// The song with these sections in place of the ones it has. Their lines stand together, where
// the first of the old ones stood, or else after the scenes, or else in front of the first pattern.
export function sectionEdits(code: string, blocks: PatternBlock[], sections: Section[]): TextEdit[] {
    const old = written(code)
    const lines = [...sections].sort((a, b) => a.from - b.from).map(lineOf).join('\n')
    // A line goes with the line break after it. The last of lines that stood by themselves, with
    // an empty line before and after them, takes the empty line after with it too.
    const alone = old.length > 0 && (old[0].at === 0 || code.slice(old[0].at - 2, old[0].at) === '\n\n')
    const gone = (line: Written, last: boolean): TextEdit => {
        if (code[line.end] !== '\n') return { from: line.at - (code[line.at - 1] === '\n' ? 1 : 0), to: line.end, insert: '' }
        return { from: line.at, to: line.end + (last && alone && code[line.end + 1] === '\n' ? 2 : 1), insert: '' }
    }
    if (old.length) {
        const [first, ...rest] = old
        const after = rest.map((line, at) => gone(line, at === rest.length - 1))
        return [lines ? { from: first.at, to: first.end, insert: lines } : gone(first, !rest.length), ...after]
    }
    if (!lines) return []
    const scenes = readScenes(code)
    const last = scenes[scenes.length - 1]
    if (last) return [{ from: last.to, to: last.to, insert: `\n${lines}` }]
    if (!blocks.length) return []
    const first = Math.min(...blocks.map((block) => block.from))
    return [{ from: first, to: first, insert: `${lines}\n\n` }]
}

// The bars from `from` up to `to` under a name. What other sections had of them they lose.
export function namedBars(sections: Section[], from: number, to: number, name: string): Section[] {
    const clean = cleanSectionName(name)
    if (!clean || to <= from) return sections
    const kept = sections.flatMap((section) => {
        const parts: Section[] = []
        if (section.from < from) parts.push({ ...section, to: Math.min(section.to, from) })
        if (section.to > to) parts.push({ ...section, from: Math.max(section.from, to) })
        return parts
    })
    return [...kept, { name: clean, from, to }].sort((a, b) => a.from - b.from)
}

// The sections after the bars of the song were changed: `change` does to a list of bars what was
// done to the song's, and each bar keeps the section it was in.
export function sectionsAfter(sections: Section[], length: number, change: <T>(values: T[]) => T[]): Section[] {
    const of = Array.from({ length }, (_, bar) => sections.findIndex((section) => bar >= section.from && bar < section.to))
    const after = change(of)
    const moved: Section[] = []
    after.forEach((index, bar) => {
        const last = moved[moved.length - 1]
        if (index < 0) return
        if (last && last.to === bar && after[bar - 1] === index) last.to = bar + 1
        else moved.push({ name: sections[index].name, from: bar, to: bar + 1 })
    })
    return moved
}

export const sameSections = (a: Section[], b: Section[]): boolean => a.length === b.length && a.every((one, at) => one.name === b[at].name && one.from === b[at].from && one.to === b[at].to)
