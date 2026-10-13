import { fromBase64, readSource, SONG_LIMIT, SOUND_NAME, soundsUsed } from '../library/songfile'
import { checkSong } from './check'

// What a song file has to be to be published. A song file holds code, and code runs on the
// machine of whoever opens the file, so a published one may hold nothing but a song: music
// code, and sounds that are sounds. The app asks this before it sends a file, and the site has
// to ask it again of every file it is handed, whoever hands it over, because a file can be
// made by hand. So this needs nothing of a browser and runs the same in both places.
export type FileRefused = { why: 'size' | 'file' | 'code' | 'sound'; what: string; line?: number }

const VERSION = 1
const PARTS = ['weft', 'name', 'keys', 'code', 'sounds', 'source']
const SOUND_PARTS = ['name', 'file', 'type', 'seconds', 'data', 'onset']
const NAME_LIMIT = 60
const FILE_NAME_LIMIT = 120
const MOST_SOUNDS = 32
const MOST_KEYS = 64

const four = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.subarray(at, at + 4))

// Whether these bytes start the way an audio file does: WAV, AIFF, Ogg, FLAC, MP3, MP4 or WebM.
export function looksLikeAudio(bytes: Uint8Array): boolean {
    if (bytes.length < 12) return false
    const head = four(bytes, 0)
    const kind = four(bytes, 8)
    if (head === 'RIFF' && kind === 'WAVE') return true
    if (head === 'FORM' && (kind === 'AIFF' || kind === 'AIFC')) return true
    if (head === 'OggS' || head === 'fLaC' || head.startsWith('ID3')) return true
    if (four(bytes, 4) === 'ftyp') return true
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return true
    return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0
}

const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`
const notASong = (what: string): FileRefused => ({ why: 'file', what })
const isText = (value: unknown, most: number): value is string => typeof value === 'string' && value.length <= most
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

// Null when the file may be published. Otherwise the first thing that stands in the way.
export function checkSongFile(text: string, limit = SONG_LIMIT): FileRefused | null {
    const size = new TextEncoder().encode(text).length
    if (size > limit) return { why: 'size', what: `The file is ${megabytes(size)} and the most a song file can be is ${megabytes(limit)}.` }
    let file: unknown
    try {
        file = JSON.parse(text)
    } catch {
        return notASong('This is not a song file made by Weft Loom.')
    }
    if (!isRecord(file) || file.weft !== VERSION) return notASong('This is not a song file made by Weft Loom.')
    const extra = Object.keys(file).find((part) => !PARTS.includes(part))
    if (extra !== undefined) return notASong(`The file holds something a song file does not have: ${extra.slice(0, 40)}.`)
    if (!isText(file.name, NAME_LIMIT) || !file.name.trim()) return notASong('The song has no name, or one that is too long.')
    if (typeof file.code !== 'string') return notASong('The file has no song in it.')
    if (!isRecord(file.keys) || Object.keys(file.keys).length > MOST_KEYS || !Object.entries(file.keys).every(([id, key]) => id.length <= NAME_LIMIT && isText(key, NAME_LIMIT))) return notASong('What the file says about the keys of its patterns cannot be read.')
    if (!Array.isArray(file.sounds) || file.sounds.length > MOST_SOUNDS) return notASong(`A song file can hold ${MOST_SOUNDS} sounds at most.`)
    if (file.source !== undefined && (!isRecord(file.source) || Object.keys(file.source).some((part) => !['id', 'name', 'by'].includes(part)) || !readSource(file.source))) return notASong('What the file says about where it came from cannot be read.')

    const refused = checkSong(file.code)
    if (refused) return { why: 'code', what: refused.what, line: refused.line }

    const seen = new Set<string>()
    for (const sound of file.sounds as unknown[]) {
        if (!isRecord(sound) || Object.keys(sound).some((part) => !SOUND_PARTS.includes(part))) return { why: 'sound', what: 'One of the sounds in the file is not written the way a sound is.' }
        const name = sound.name
        if (typeof name !== 'string' || !SOUND_NAME.test(name) || seen.has(name)) return { why: 'sound', what: 'One of the sounds in the file has a name a sound cannot have, or a name another has too.' }
        seen.add(name)
        if (!isText(sound.file, FILE_NAME_LIMIT) || typeof sound.type !== 'string' || !/^(audio\/[\w.+-]+)?$/.test(sound.type)) return { why: 'sound', what: `The sound ${name} does not say that it is audio.` }
        if (typeof sound.seconds !== 'number' || !(sound.seconds >= 0) || (sound.onset !== undefined && (typeof sound.onset !== 'number' || !(sound.onset >= 0)))) return { why: 'sound', what: `What the file says about the sound ${name} cannot be read.` }
        let bytes: Uint8Array
        try {
            bytes = fromBase64(String(sound.data))
        } catch {
            return { why: 'sound', what: `The sound ${name} cannot be read.` }
        }
        if (typeof sound.data !== 'string' || !looksLikeAudio(bytes)) return { why: 'sound', what: `The sound ${name} is not an audio file.` }
        if (!soundsUsed(file.code, [name]).length) return { why: 'sound', what: `The file holds the sound ${name}, which the song does not use.` }
    }
    return null
}
