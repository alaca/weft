// A song as one file, to keep somewhere safe or to give to someone: its name, its code, the keys
// of its patterns and the audio files of your own that it uses, so that it plays wherever it is opened.
export type PackedSound = { name: string; file: string; type: string; seconds: number; data: Uint8Array }
export type SongFile = { name: string; code: string; keys: Record<string, string>; sounds: PackedSound[] }

export const SONG_FILE = 'weft'
const VERSION = 1
const CHUNK = 0x8000

function toBase64(bytes: Uint8Array): string {
    let text = ''
    for (let at = 0; at < bytes.length; at += CHUNK) text += String.fromCharCode(...bytes.subarray(at, at + CHUNK))
    return btoa(text)
}

function fromBase64(text: string): Uint8Array {
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
    })
}

const baseName = (file: string) => file.replace(/\.[a-z0-9]{1,8}$/i, '').trim() || 'Song'

// A song file made by the app, or failing that any file of code, which becomes a song with the
// name of the file. Null when it is a song file that cannot be read.
export function readSongFile(text: string, file: string): SongFile | null {
    if (!file.toLowerCase().endsWith(`.${SONG_FILE}`)) return { name: baseName(file), code: text, keys: {}, sounds: [] }
    try {
        const kept = JSON.parse(text) as { weft?: unknown; name?: unknown; keys?: unknown; code?: unknown; sounds?: unknown }
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
                          },
                      ]
                    : [],
            ),
        }
    } catch {
        return null
    }
}

const word = (name: string) => new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`, 'g')

// The sounds of your own that a song's code names.
export const soundsUsed = (code: string, names: string[]): string[] => names.filter((name) => word(name).test(code))

// The code with one sound's name changed, wherever it stands as a whole word.
export const renameSound = (code: string, from: string, to: string): string => code.replace(word(from), to)
