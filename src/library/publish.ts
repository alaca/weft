import { checkSong } from '../guard/check'
import { checkSongFile, type FileRefused } from '../guard/file'
import { shrinkSounds, type Decoded } from './shrink'
import { SONG_LIMIT, writeSongFile, type SongFile } from './songfile'

// A song as the file that goes to the site, or why it cannot go. The code is looked at first:
// a song that holds anything but music code is not published, and there is no way round that.
// Then its sounds are made small enough for the file to fit, and the whole file is checked the
// way the site will check it.
export type Prepared =
    | { ok: true; text: string; kbps: number | null }
    | { ok: false; refused: FileRefused; largest?: { name: string; bytes: number } }

export async function prepareForPublishing(
    song: SongFile,
    decode: (bytes: Uint8Array, sampleRate?: number) => Promise<Decoded | null>,
    encode: (sound: Decoded, kbps: number) => Promise<Uint8Array>,
    limit = SONG_LIMIT,
): Promise<Prepared> {
    const code = checkSong(song.code)
    if (code) return { ok: false, refused: { why: 'code', what: code.what, line: code.line } }
    const shrunk = await shrinkSounds(song.sounds, (sounds) => writeSongFile({ ...song, sounds }).length, decode, encode, limit)
    const text = writeSongFile({ ...song, sounds: shrunk.sounds })
    const refused = checkSongFile(text, limit)
    if (!refused) return { ok: true, text, kbps: shrunk.kbps }
    const largest = [...shrunk.sounds].sort((a, b) => b.data.length - a.data.length)[0]
    return { ok: false, refused, ...(refused.why === 'size' && largest ? { largest: { name: largest.name, bytes: largest.data.length } } : {}) }
}
