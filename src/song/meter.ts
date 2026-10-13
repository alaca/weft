import type { Song, TextEdit } from './types'

// How a bar is counted. A song is in four quarter notes to the bar unless it says otherwise, in
// a line of its own under its tempo:
//
//   setcpm(120/3)
//   // time 3/4
//
// The tempo always counts quarter notes, so the number the tempo is divided by is how many of
// them a bar holds, and Strudel plays bars of that length whatever the line says. The line is
// what tells three beats of two from two beats of three: how the steps of a grid are grouped,
// how many steps a new pattern has, and how many beats the count at the top shows.
export type Meter = { label: string; quarters: number; beats: number }

export const METERS: Meter[] = [
    { label: '2/4', quarters: 2, beats: 2 },
    { label: '3/4', quarters: 3, beats: 3 },
    { label: '4/4', quarters: 4, beats: 4 },
    { label: '5/4', quarters: 5, beats: 5 },
    { label: '6/8', quarters: 3, beats: 2 },
    { label: '7/8', quarters: 3.5, beats: 7 },
    { label: '12/8', quarters: 6, beats: 4 },
]
export const USUAL: Meter = METERS[2]

const LINE = /^[ \t]*\/\/[ \t]*time[ \t]+(\d+\/\d+)[ \t]*$/m

export const readMeter = (code: string): Meter => METERS.find((meter) => meter.label === LINE.exec(code)?.[1]) ?? USUAL

// Sixteenth notes to the bar: the steps a new grid has.
export const usualSteps = (meter: Meter): number => meter.quarters * 4

const whole = (steps: number[]): number[] => [...new Set(steps.filter((count) => Number.isInteger(count) && count >= 2))].sort((a, b) => a - b)
// A beat that is a quarter note can be cut in threes as well as in fours; one of three eighths
// is in threes already.
const inThrees = (meter: Meter): boolean => meter.label.endsWith('/8')

// The numbers of steps to the bar that are offered: for drums, for notes, and for a sample cut
// into parts. In four quarters they are what they always were.
export const drumSteps = (meter: Meter): number[] => {
    const steps = usualSteps(meter)
    return whole(inThrees(meter) ? [steps / 2, steps, steps * 2] : [(steps * 3) / 4, steps, (steps * 3) / 2, steps * 2])
}
export const noteSteps = (meter: Meter): number[] => {
    const steps = usualSteps(meter)
    return whole(inThrees(meter) ? [steps / 4, steps / 2, steps, steps * 2] : [steps / 4, steps / 2, (steps * 3) / 4, steps, (steps * 3) / 2, steps * 2])
}
export const sliceSteps = (meter: Meter): number[] => {
    const steps = usualSteps(meter)
    return whole([steps / 2, steps, steps * 2])
}

// The meter of the song that is open. What reads a pattern from the code asks it here, because
// a pattern does not say what song it is in.
let now: Meter = USUAL
export const meterNow = (): Meter => now
export const setMeterNow = (meter: Meter) => void (now = meter)

// Whether so many steps over so many bars is a grid of this meter. In four quarters it is any
// number of fours, as it always was.
export function fitsBar(steps: number, cycles?: number): boolean {
    if (now === USUAL) return steps % 4 === 0
    const offered = new Set([...drumSteps(now), ...noteSteps(now)])
    return (cycles ? [cycles] : [1, 2, 4]).some((bars) => steps % bars === 0 && offered.has(steps / bars))
}

// How many steps stand together as a beat, where the steps of a bar come out even on its beats.
export const beatSteps = (perBar: number): number | null => (now !== USUAL && perBar % now.beats === 0 ? perBar / now.beats : null)

const lineOf = (meter: Meter) => `// time ${meter.label}`

// The song put in another meter: its line, which four quarters does without, and the number its
// tempo is divided by, so that the tempo stays the number it was.
export function meterEdits(code: string, song: Song, meter: Meter): TextEdit[] {
    const edits: TextEdit[] = []
    const found = LINE.exec(code)
    const line = meter === USUAL ? null : lineOf(meter)
    if (found && !line) edits.push({ from: found.index, to: code[found.index + found[0].length] === '\n' ? found.index + found[0].length + 1 : found.index + found[0].length, insert: '' })
    else if (found && line && found[0] !== line) edits.push({ from: found.index, to: found.index + found[0].length, insert: line })
    const tempo = song.tempo
    const text = tempo ? `${tempo.bpm}/${meter.quarters}` : ''
    if (tempo && tempo.unit === 'cpm' && code.slice(tempo.from, tempo.to) !== text) edits.push({ from: tempo.from, to: tempo.to, insert: text })
    if (!found && line) {
        if (tempo) {
            const end = code.indexOf('\n', tempo.to)
            const at = end < 0 ? code.length : end
            edits.push({ from: at, to: at, insert: `\n${line}` })
        } else edits.push({ from: song.insertAt, to: song.insertAt, insert: `setcpm(120/${meter.quarters})\n${line}\n\n` })
    }
    return edits
}
