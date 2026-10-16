import { checkSong } from '../guard/check'
import { looksLikeAudio } from '../guard/file'
import { cleanSnippetName, CODE_MOST, type Snippet } from './snippets'
import { fitSoundName, fromBase64, toBase64InTurns } from './songfile'
import { turnWhenDue } from './turn'

// A pack is sounds, presets and snippets that someone made for others to use, as one file. Added to the
// app, its sounds are in the Sounds like the ones the app comes with, in any song. A song
// that uses one of them carries that sound along, as it carries a sound of your own, so it
// plays for whoever opens it, with the pack or without.
//
// Every sound of a pack has the pack's own short name in front of its own, `dust_break_1`, so
// that it can never be taken for a sound of another pack or for one of yours.
export const PACK_FILE = 'weftpack'
const VERSION = 1

export type PackPreset = { name: string; calls: string[]; pitch?: number }
export type PackSound = { name: string; file: string; type: string; seconds: number; data: Uint8Array }
export type PackFile = { id: string; name: string; by: string; about: string; sounds: PackSound[]; presets: PackPreset[]; snippets: Snippet[] }
// What is kept of a pack that was added: everything but the sounds themselves, which are kept
// where your own sounds are.
export type PackInfo = { id: string; name: string; by: string; about: string; sounds: string[]; presets: PackPreset[]; snippets: Snippet[]; addedAt: number }
export const PACK_ID = /^[a-z][a-z0-9]{1,15}$/
export const MOST_SOUNDS = 500
export const MOST_PRESETS = 200
export const MOST_SNIPPETS = 200
const NAME_MOST = 60
const BY_MOST = 40
const ABOUT_MOST = 300
const FILE_MOST = 120

const clean = (text: unknown, most: number): string => (typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, most) : '')

// The short name of a pack, made from the name people read: its letters and digits.
export function packIdFor(name: string, taken: (id: string) => boolean): string {
    const base = name
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .slice(0, 12)
    const id = /^[a-z]/.test(base) && base.length > 1 ? base : `pack${base}`.slice(0, 12)
    if (!taken(id)) return id
    let count = 2
    while (taken(`${id}${count}`)) count++
    return `${id}${count}`
}

// The name a sound has inside a pack.
export const packSoundName = (id: string, name: string): string => `${id}_${name}`.slice(0, 60)
export const isOfPack = (id: string, name: string): boolean => name.startsWith(`${id}_`) && name.length > id.length + 1

// A preset is code that is written into a song, so one that comes in a file is only taken when
// it is music code and nothing more, asked the way a song from someone else is asked.
export function fitPreset(preset: PackPreset): boolean {
    if (!preset.name || !preset.calls.length || preset.calls.some((call) => !call.startsWith('.') || call.length > 400)) return false
    return checkSong(`sound: note("c")${preset.calls.join('')}`) === null
}

function readPreset(entry: unknown): PackPreset | null {
    const given = entry as { name?: unknown; calls?: unknown; pitch?: unknown } | null
    const name = clean(given?.name, 40)
    const calls = Array.isArray(given?.calls) ? given.calls.filter((call): call is string => typeof call === 'string') : []
    const preset: PackPreset = { name, calls, ...(typeof given?.pitch === 'number' && given.pitch >= 0 && given.pitch <= 127 ? { pitch: Math.round(given.pitch) } : {}) }
    return fitPreset(preset) ? preset : null
}

// A snippet is code that is written into a song too, and is taken on the same terms. One that
// goes on the end of a pattern is asked as the end of one.
export function fitSnippet(snippet: Snippet): boolean {
    if (!snippet.name || !snippet.code.trim() || snippet.code.length > CODE_MOST) return false
    return checkSong(snippet.code.startsWith('.') ? `sound: note("c")${snippet.code}` : snippet.code) === null
}

function readSnippet(entry: unknown): Snippet | null {
    const given = entry as { name?: unknown; code?: unknown } | null
    const snippet = { name: typeof given?.name === 'string' ? cleanSnippetName(given.name) : '', code: typeof given?.code === 'string' ? given.code.trim() : '' }
    return fitSnippet(snippet) ? snippet : null
}

const readSnippets = (given: unknown): Snippet[] => {
    const seen = new Set<string>()
    return (Array.isArray(given) ? given : []).flatMap((entry) => {
        const snippet = readSnippet(entry)
        if (!snippet || seen.has(snippet.name)) return []
        seen.add(snippet.name)
        return [snippet]
    })
}

export type PackRead = { pack: PackFile; left: number } | { why: string }

// A pack as it is read from a file. What does not belong in one is left out and counted; a
// file that is no pack at all says why.
export function readPackFile(text: string): PackRead {
    let kept: Record<string, unknown>
    try {
        kept = JSON.parse(text) as Record<string, unknown>
    } catch {
        return { why: 'It is not a pack made for Weft Loom.' }
    }
    if (!kept || typeof kept !== 'object' || kept.weftpack !== VERSION) return { why: 'It is not a pack made for Weft Loom, or it was made for a newer version of the app.' }
    const id = typeof kept.id === 'string' ? kept.id : ''
    const name = clean(kept.name, NAME_MOST)
    if (!PACK_ID.test(id) || !name) return { why: 'It does not say which pack it is.' }
    const given = Array.isArray(kept.sounds) ? kept.sounds : []
    const presetsGiven = Array.isArray(kept.presets) ? kept.presets : []
    const snippetsGiven = Array.isArray(kept.snippets) ? kept.snippets : []
    if (given.length > MOST_SOUNDS || presetsGiven.length > MOST_PRESETS || snippetsGiven.length > MOST_SNIPPETS) return { why: `A pack holds ${MOST_SOUNDS} sounds, ${MOST_PRESETS} presets and ${MOST_SNIPPETS} snippets at most.` }
    const sounds: PackSound[] = []
    const seen = new Set<string>()
    for (const entry of given as { name?: unknown; file?: unknown; type?: unknown; seconds?: unknown; data?: unknown }[]) {
        const soundName = typeof entry?.name === 'string' ? entry.name : ''
        if (!fitSoundName(soundName) || !isOfPack(id, soundName) || seen.has(soundName) || typeof entry.data !== 'string') continue
        let data: Uint8Array
        try {
            data = fromBase64(entry.data)
        } catch {
            continue
        }
        if (!looksLikeAudio(data)) continue
        seen.add(soundName)
        sounds.push({
            name: soundName,
            file: clean(entry.file, FILE_MOST) || soundName,
            type: typeof entry.type === 'string' && /^audio\/[\w.+-]+$/.test(entry.type) ? entry.type : '',
            seconds: typeof entry.seconds === 'number' && entry.seconds >= 0 ? entry.seconds : 0,
            data,
        })
    }
    const presets = presetsGiven.flatMap((entry) => readPreset(entry) ?? [])
    const snippets = readSnippets(snippetsGiven)
    if (!sounds.length && !presets.length && !snippets.length) return { why: 'There is nothing in it that the app can use.' }
    return { pack: { id, name, by: clean(kept.by, BY_MOST), about: clean(kept.about, ABOUT_MOST), sounds, presets, snippets }, left: given.length - sounds.length + presetsGiven.length - presets.length + snippetsGiven.length - snippets.length }
}

// The text of the file. A pack can be many megabytes of sound, so it is made a piece at a time.
export async function writePackFile(pack: PackFile): Promise<string> {
    const turn = turnWhenDue()
    const texts: string[] = []
    for (const sound of pack.sounds) {
        texts.push(await toBase64InTurns(sound.data, turn))
        await turn()
    }
    return JSON.stringify({
        weftpack: VERSION,
        id: pack.id,
        name: pack.name,
        by: pack.by,
        about: pack.about,
        sounds: pack.sounds.map(({ data: _, ...rest }, at) => ({ ...rest, data: texts[at] })),
        presets: pack.presets,
        snippets: pack.snippets.map(({ name, code }) => ({ name, code })),
    })
}

// The packs that were added, as they are kept between starts.
export function readPacks(text: string | null): PackInfo[] {
    try {
        const kept = JSON.parse(text ?? '[]') as unknown
        if (!Array.isArray(kept)) return []
        return kept.flatMap((entry: Partial<PackInfo>) => {
            if (typeof entry?.id !== 'string' || !PACK_ID.test(entry.id) || typeof entry.name !== 'string') return []
            return [
                {
                    id: entry.id,
                    name: clean(entry.name, NAME_MOST),
                    by: clean(entry.by, BY_MOST),
                    about: clean(entry.about, ABOUT_MOST),
                    sounds: Array.isArray(entry.sounds) ? entry.sounds.filter((name): name is string => typeof name === 'string' && isOfPack(entry.id!, name)) : [],
                    presets: Array.isArray(entry.presets) ? entry.presets.flatMap((preset) => readPreset(preset) ?? []) : [],
                    snippets: readSnippets(entry.snippets),
                    addedAt: typeof entry.addedAt === 'number' ? entry.addedAt : 0,
                },
            ]
        })
    } catch {
        return []
    }
}

export const writePacks = (packs: PackInfo[]): string => JSON.stringify(packs)

// The pack a sound belongs to, by its name.
export const packOf = (packs: PackInfo[], sound: string): PackInfo | undefined => packs.find((pack) => isOfPack(pack.id, sound) && pack.sounds.includes(sound))
