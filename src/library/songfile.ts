// A song as one file, to keep somewhere safe or to give to someone: its name, its code, the keys
// of its patterns and the audio files of your own that it uses, so that it plays wherever it is opened.
// `onset` is only there for a sound that was made smaller for the file: where the sound it was
// made from started, in seconds.
export type PackedSound = { name: string; file: string; type: string; seconds: number; data: Uint8Array; onset?: number }
// `source` is the published song a file was downloaded as, so that a song made from it can say
// what it was reworked from.
export type SongSource = { id: string; name: string; by: string }
export type SongFile = { name: string; code: string; keys: Record<string, string>; sounds: PackedSound[]; source?: SongSource }

// What a file says about where it came from, when it says it in a way that can be kept.
export function readSource(value: unknown): SongSource | null {
    const given = value as Partial<SongSource> | null
    if (!given || typeof given !== 'object' || typeof given.id !== 'string' || typeof given.name !== 'string' || typeof given.by !== 'string') return null
    if (!/^[a-z0-9]{1,16}$/.test(given.id) || !given.name || given.name.length > 60 || given.by.length > 24) return null
    return { id: given.id, name: given.name, by: given.by }
}

export const SONG_FILE = 'weft'
// The most a song file may be to be published, the owner's rule.
export const SONG_LIMIT = 1024 * 1024
const VERSION = 1
const CHUNK = 0x8000

function toBase64(bytes: Uint8Array): string {
    let text = ''
    for (let at = 0; at < bytes.length; at += CHUNK) text += String.fromCharCode(...bytes.subarray(at, at + CHUNK))
    return btoa(text)
}

export function fromBase64(text: string): Uint8Array {
    const raw = atob(text)
    const bytes = new Uint8Array(raw.length)
    for (let at = 0; at < raw.length; at++) bytes[at] = raw.charCodeAt(at)
    return bytes
}

export function writeSongFile(song: SongFile): string {
    return JSON.stringify({
        weft: VERSION,
        name: song.name,
        keys: song.keys,
        code: song.code,
        sounds: song.sounds.map(({ data, ...rest }) => ({ ...rest, data: toBase64(data) })),
        ...(song.source ? { source: song.source } : {}),
    })
}

const baseName = (file: string) => file.replace(/\.[a-z0-9]{1,8}$/i, '').trim() || 'Song'

// A song file made by the app, or failing that any file of code, which becomes a song with the
// name of the file. Null when it is a song file that cannot be read.
export function readSongFile(text: string, file: string): SongFile | null {
    if (!file.toLowerCase().endsWith(`.${SONG_FILE}`)) return { name: baseName(file), code: text, keys: {}, sounds: [] }
    try {
        const kept = JSON.parse(text) as { weft?: unknown; name?: unknown; keys?: unknown; code?: unknown; sounds?: unknown; source?: unknown }
        if (typeof kept.weft !== 'number' || typeof kept.code !== 'string') return null
        const sounds = Array.isArray(kept.sounds) ? kept.sounds : []
        return {
            name: typeof kept.name === 'string' && kept.name.trim() ? kept.name : baseName(file),
            code: kept.code,
            keys: kept.keys && typeof kept.keys === 'object' ? Object.fromEntries(Object.entries(kept.keys).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {},
            sounds: sounds.flatMap((sound: Partial<Record<keyof PackedSound, unknown>>) =>
                typeof sound?.name === 'string' && typeof sound.data === 'string'
                    ? [
                          {
                              name: sound.name,
                              file: typeof sound.file === 'string' ? sound.file : sound.name,
                              type: typeof sound.type === 'string' ? sound.type : '',
                              seconds: typeof sound.seconds === 'number' ? sound.seconds : 0,
                              data: fromBase64(sound.data),
                              ...(typeof sound.onset === 'number' && sound.onset >= 0 ? { onset: sound.onset } : {}),
                          },
                      ]
                    : [],
            ),
            ...(readSource(kept.source) ? { source: readSource(kept.source)! } : {}),
        }
    } catch {
        return null
    }
}

// The name of a sound of your own, as the app writes it.
export const SOUND_NAME = /^[a-z][a-z0-9_]{0,59}$/
const NOTE_NAME = /^[a-g][sbf]*\d*$/

// Whether a sound may go by this name without being taken for something else. A note, or a
// letter or two that patterns are written with, would be found in the text of songs that never
// meant it, and a sound from someone else could then travel in every song that is saved or
// shared from here. The words of the code itself are no trouble: a name is only looked for in
// text.
export const fitSoundName = (name: string): boolean => SOUND_NAME.test(name) && name.length >= 3 && !NOTE_NAME.test(name)

// Where the text of the code is: what stands between quotes, and not in a comment. A sound is
// named in text, so only there is a name looked for.
function textSpans(code: string): [number, number][] {
    const spans: [number, number][] = []
    for (let at = 0; at < code.length; at++) {
        const char = code[at]
        if (char === '/' && code[at + 1] === '/') {
            const end = code.indexOf('\n', at)
            at = end < 0 ? code.length : end
        } else if (char === '/' && code[at + 1] === '*') {
            const end = code.indexOf('*/', at + 2)
            at = end < 0 ? code.length : end + 1
        } else if (char === '"' || char === "'" || char === '`') {
            let end = at + 1
            while (end < code.length && code[end] !== char && (char === '`' || code[end] !== '\n')) end += code[end] === '\\' ? 2 : 1
            spans.push([at + 1, Math.min(end, code.length)])
            at = end
        }
    }
    return spans
}

const word = (name: string) => new RegExp(`(?<![A-Za-z0-9_])${name.replace(/[^A-Za-z0-9_]/g, '\\$&')}(?![A-Za-z0-9_])`, 'g')
const found = (code: string, name: string): number[] => {
    const spans = textSpans(code)
    return [...code.matchAll(word(name))].map((match) => match.index).filter((at) => spans.some(([from, to]) => at >= from && at + name.length <= to))
}

// The sounds of your own that a song's code names.
export const soundsUsed = (code: string, names: string[]): string[] => names.filter((name) => found(code, name).length > 0)

// The changes that give one sound another name in the code, wherever the code names it.
export const soundRenames = (code: string, from: string, to: string): { from: number; to: number; insert: string }[] => found(code, from).map((at) => ({ from: at, to: at + from.length, insert: to }))

// The code with one sound's name changed, wherever the code names it.
export const renameSound = (code: string, from: string, to: string): string =>
    soundRenames(code, from, to)
        .reverse()
        .reduce((text, edit) => text.slice(0, edit.from) + edit.insert + text.slice(edit.to), code)
