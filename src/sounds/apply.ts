import { addCall, setString } from '../song/edits'
import { sourceText } from '../song/grid'
import type { PatternBlock, TextEdit } from '../song/types'
import type { SoundGroup, SoundItem } from './catalog'

export const takesKit = (block: PatternBlock): boolean => sourceText(block) !== null

export const fits = (block: PatternBlock, group: SoundGroup): boolean => (group === 'kits') === takesKit(block)

export const inUse = (block: PatternBlock, item: SoundItem): boolean =>
    fits(block, item.group) && block.soundName?.toLowerCase() === item.name.toLowerCase()

export function soundEdit(code: string, block: PatternBlock, item: SoundItem): TextEdit {
    const names = item.group === 'kits' ? ['bank'] : ['s', 'sound']
    const arg = block.calls.slice(1).find((call) => names.includes(call.name) && call.args[0]?.kind === 'string')?.args[0]
    if (arg?.kind === 'string') return setString(arg, item.name)
    return addCall(code, block, `.${names[0]}("${item.name}")`)
}
