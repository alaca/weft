import { addCall, setString } from '../song/edits'
import { isDrums, readKit } from '../song/kit'
import type { PatternBlock, TextEdit } from '../song/types'
import type { SoundGroup, SoundItem } from './catalog'

export const takesKit = (block: PatternBlock): boolean => isDrums(block)

// A sound of your own goes anywhere: it is the sound of a pattern that plays notes, and one
// more row in a drum grid, whatever kit the grid is on.
export const fits = (block: PatternBlock, group: SoundGroup): boolean => group === 'yours' || (group === 'kits') === takesKit(block)

export const isRow = (block: PatternBlock, item: SoundItem): boolean => item.group === 'yours' && takesKit(block)

export const inUse = (block: PatternBlock, item: SoundItem): boolean => {
    if (!fits(block, item.group)) return false
    if (isRow(block, item)) return readKit(block)?.rows.some((row) => row.sound === item.name) ?? false
    return block.soundName?.toLowerCase() === item.name.toLowerCase()
}

export function soundEdit(code: string, block: PatternBlock, item: SoundItem): TextEdit {
    const names = item.group === 'kits' ? ['bank'] : ['s', 'sound']
    const arg = block.calls.slice(1).find((call) => names.includes(call.name) && call.args[0]?.kind === 'string')?.args[0]
    if (arg?.kind === 'string') return setString(arg, item.name)
    return addCall(code, block, `.${names[0]}("${item.name}")`)
}
