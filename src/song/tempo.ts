import { curveText, parseCurve } from './curves'
import type { Song, TextEdit } from './types'

// The tempo can change along the song: a tempo for every bar, written as a line of its own
// under the tempo the song is set to, the way a knob that is drawn over the song is written:
//
//   setcpm(124/4)
//   // tempo <124!16 132!8 140!8>
//
// To Strudel that line is a remark. The app plays each bar at its tempo, and makes a file of
// the song the same way. A list shorter than the song goes round, as every such list does.
export type TempoLane = { values: number[]; from: number; to: number }

export const TEMPO_LEAST = 40
export const TEMPO_MOST = 240

const LINE = /^[ \t]*\/\/[ \t]*tempo[ \t]+(<[^<>\n]*>)[ \t]*$/m

export function readTempoLane(code: string): TempoLane | null {
    const found = LINE.exec(code)
    const values = found ? parseCurve(found[1])?.map(Number) : null
    if (!found || !values || values.some((bpm) => !(bpm >= 1 && bpm <= 999))) return null
    return { values, from: found.index, to: found.index + found[0].length }
}

export const fitTempo = (bpm: number): number => Math.round(Math.min(TEMPO_MOST, Math.max(TEMPO_LEAST, bpm)))

const lineOf = (values: number[]) => `// tempo ${curveText(values.map((bpm) => String(fitTempo(bpm))))}`

// The line put in, changed, or taken out again with `null`. It goes under the line that sets
// the tempo of the song, or else where that line would go.
export function tempoLaneEdit(code: string, song: Song, values: number[] | null): TextEdit | null {
    const lane = readTempoLane(code)
    if (lane) {
        if (values) return code.slice(lane.from, lane.to) === lineOf(values) ? null : { from: lane.from, to: lane.to, insert: lineOf(values) }
        // The line goes with the break that ended it.
        return { from: lane.from, to: code[lane.to] === '\n' ? lane.to + 1 : lane.to, insert: '' }
    }
    if (!values) return null
    if (!song.tempo) return { from: song.insertAt, to: song.insertAt, insert: `${lineOf(values)}\n\n` }
    const end = code.indexOf('\n', song.tempo.to)
    const at = end < 0 ? code.length : end
    return { from: at, to: at, insert: `\n${lineOf(values)}` }
}

// The tempo of a bar: the one drawn for it, or the tempo of the song.
export const tempoAt = (lane: TempoLane | null, bar: number, usual: number): number => (lane ? lane.values[((Math.floor(bar) % lane.values.length) + lane.values.length) % lane.values.length] : usual)

// How long so many bars last, in seconds, each at its own tempo.
export function secondsOf(lane: TempoLane | null, bars: number, usual: number, beats = 4): number {
    let seconds = 0
    for (let bar = 0; bar < bars; bar++) seconds += (60 * beats) / Math.max(1, tempoAt(lane, bar, usual))
    return seconds
}
