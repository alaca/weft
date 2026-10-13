import { readLaid } from '../song/audio'
import { addCall, setString } from '../song/edits'
import { isDrums, readKit } from '../song/kit'
import { readSlices } from '../song/slices'
import type { PatternBlock, TextEdit } from '../song/types'
import type { SoundGroup, SoundItem } from './catalog'

export const takesKit = (block: PatternBlock): boolean => isDrums(block)

// A sound of your own goes anywhere: it is the sound of a pattern that plays notes, and one
// more row in a drum grid, whatever kit the grid is on.
// A sample that is cut into parts is a sample or a sound of your own, and nothing else.
export const isSliced = (block: PatternBlock): boolean => readSlices(block) !== null

// A recording that plays along the song is a sound of your own: only of those is it known how
// long they are.
export const isLaid = (block: PatternBlock): boolean => readLaid(block) !== null

export const fits = (block: PatternBlock, group: SoundGroup): boolean =>
    isLaid(block) ? group === 'yours' : isSliced(block) ? group === 'samples' || group === 'yours' : group === 'yours' || (group === 'kits') === takesKit(block)

// A preset is a whole sound, for a pattern that plays notes.
export const isPreset = (item: SoundItem): boolean => item.group === 'presets'

export const isRow = (block: PatternBlock, item: SoundItem): boolean => item.group === 'yours' && takesKit(block)

export const inUse = (block: PatternBlock, item: SoundItem): boolean => {
    if (!fits(block, item.group) || isPreset(item)) return false
    if (isRow(block, item)) return readKit(block)?.rows.some((row) => row.sound === item.name) ?? false
    return block.soundName?.toLowerCase() === item.name.toLowerCase()
}

export function soundEdit(code: string, block: PatternBlock, item: SoundItem): TextEdit {
    const sliced = readSlices(block) ?? readLaid(block)
    if (sliced) return setString(sliced.sound, item.name)
    const names = item.group === 'kits' ? ['bank'] : ['s', 'sound']
    const arg = block.calls.slice(1).find((call) => names.includes(call.name) && call.args[0]?.kind === 'string')?.args[0]
    if (arg?.kind === 'string') return setString(arg, item.name)
    return addCall(code, block, `.${names[0]}("${item.name}")`)
}

const NAMING = ['s', 'sound', 'bank']

// The text between quotes that names a sound or a kit, when the place in the code is inside
// one: s("...") or bank("..."), of a pattern or of one row of a drum grid.
export function soundTextAt(blocks: PatternBlock[], offset: number): Extract<PatternBlock['calls'][number]['args'][number], { kind: 'string' }> | null {
    const within = blocks.flatMap((block) => [block, ...(readKit(block)?.rows.map((row) => row.block) ?? [])])
    for (const block of within) {
        for (const call of block.calls) {
            const arg = call.args[0]
            if (NAMING.includes(call.name) && arg?.kind === 'string' && offset > arg.from && offset < arg.to) return arg
        }
    }
    return null
}
