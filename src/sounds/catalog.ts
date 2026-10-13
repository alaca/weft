import { drumChoices } from '../controls/drums'

export type RawSound = { name: string; type: string; tag: string | null }
export type SoundGroup = 'kits' | 'instruments' | 'synths' | 'samples' | 'presets' | 'packs' | 'yours'
// `pack` is the pack a sound or a preset came in.
export type SoundItem = { group: SoundGroup; name: string; label: string; parts: { sound: string; label: string }[]; pack?: string }

export const SOUND_GROUPS: { id: SoundGroup; label: string }[] = [
    { id: 'kits', label: 'Drum kits' },
    { id: 'instruments', label: 'Instruments' },
    { id: 'synths', label: 'Synths' },
    { id: 'samples', label: 'Samples' },
    { id: 'presets', label: 'Presets' },
    { id: 'packs', label: 'Packs' },
    { id: 'yours', label: 'Yours' },
]

export const KIT_TAG = 'drum-machines'
export const INSTRUMENT_TAG = 'instruments'
export const YOURS_TAG = 'yours'
// What a sound carries while it is dragged from the browser into the code: its name.
export const SOUND_DRAG = 'application/x-weft-sound'

const SYNTHS: Record<string, string> = {
    sine: 'Sine wave',
    triangle: 'Triangle wave',
    square: 'Square wave',
    sawtooth: 'Sawtooth wave',
    supersaw: 'Supersaw',
    pulse: 'Pulse wave',
    sbd: 'Synth kick',
    white: 'White noise',
    pink: 'Pink noise',
    brown: 'Brown noise',
    crackle: 'Crackle',
    z_sine: 'ZZFX sine',
    z_triangle: 'ZZFX triangle',
    z_square: 'ZZFX square',
    z_sawtooth: 'ZZFX sawtooth',
    z_tan: 'ZZFX tan',
    z_noise: 'ZZFX noise',
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export const kitLabel = (name: string): string =>
    name
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/([a-z])(\d)/g, '$1 $2')

export const soundLabel = (name: string): string =>
    sentence(
        name
            .replace(/^gm_/, '')
            .replace(/_/g, ' ')
            .replace(/([a-z])(\d)/g, '$1 $2')
            .replace(/^epiano/, 'electric piano')
            .replace(/^fx /, 'effect '),
    )

export function catalogue(raw: RawSound[], kitNames: string[]): SoundItem[] {
    const cased = new Map(kitNames.map((name) => [name.toLowerCase(), name]))
    const kits = new Map<string, string[]>()
    const instruments: SoundItem[] = []
    const samples: SoundItem[] = []
    const yours: SoundItem[] = []
    const synths = new Set<string>()
    for (const sound of raw) {
        if (sound.name.startsWith('_')) continue
        if (sound.type === 'sample' && sound.tag === KIT_TAG) {
            const cut = sound.name.indexOf('_')
            const part = sound.name.slice(cut + 1)
            if (cut < 1 || !part) continue
            const kit = sound.name.slice(0, cut)
            kits.set(kit, [...(kits.get(kit) ?? []), part])
        } else if (sound.type === 'soundfont') {
            instruments.push({ group: 'instruments', name: sound.name, label: soundLabel(sound.name), parts: [] })
        } else if (sound.type === 'sample' && sound.tag === YOURS_TAG) {
            yours.push({ group: 'yours', name: sound.name, label: soundLabel(sound.name), parts: [] })
        } else if (sound.type === 'sample' && sound.tag === INSTRUMENT_TAG) {
            instruments.unshift({ group: 'instruments', name: sound.name, label: soundLabel(sound.name), parts: [] })
        } else if (sound.type === 'sample') {
            samples.push({ group: 'samples', name: sound.name, label: soundLabel(sound.name), parts: [] })
        } else if (sound.type === 'synth' && SYNTHS[sound.name]) {
            synths.add(sound.name)
        }
    }
    const byLabel = (a: SoundItem, b: SoundItem) => a.label.localeCompare(b.label)
    return [
        ...[...kits]
            .map(([kit, parts]): SoundItem => {
                const name = cased.get(kit) ?? kit
                return { group: 'kits', name, label: kitLabel(name), parts: drumChoices(parts, []) }
            })
            .sort(byLabel),
        ...instruments,
        ...Object.keys(SYNTHS)
            .filter((name) => synths.has(name))
            .map((name): SoundItem => ({ group: 'synths', name, label: SYNTHS[name], parts: [] })),
        ...samples.sort(byLabel),
        ...yours.sort(byLabel),
    ]
}

const matches = (item: SoundItem, words: string[]) => {
    const text = `${item.label} ${item.name}`.toLowerCase()
    return words.every((word) => text.includes(word))
}

const wordsOf = (query: string) => query.trim().toLowerCase().split(/\s+/).filter(Boolean)

export function findSounds(items: SoundItem[], group: SoundGroup, query: string): SoundItem[] {
    const words = wordsOf(query)
    return items.filter((item) => item.group === group && matches(item, words))
}

export function countSounds(items: SoundItem[], query: string): Record<SoundGroup, number> {
    const words = wordsOf(query)
    const counts: Record<SoundGroup, number> = { kits: 0, instruments: 0, synths: 0, samples: 0, presets: 0, packs: 0, yours: 0 }
    for (const item of items) if (matches(item, words)) counts[item.group]++
    return counts
}
