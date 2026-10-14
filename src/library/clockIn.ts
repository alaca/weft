// A MIDI clock coming in, from a drum machine or another program that leads: twenty-four ticks
// to a quarter note, and words to start, to go on from where it stopped, to stop, and to say
// where in the song it is.
export type ClockWord = { kind: 'tick' | 'start' | 'go on' | 'stop'; at: number } | { kind: 'place'; quarters: number; at: number }

const WORDS: Record<number, 'tick' | 'start' | 'go on' | 'stop'> = { 0xf8: 'tick', 0xfa: 'start', 0xfb: 'go on', 0xfc: 'stop' }

export const isClockByte = (status: number): boolean => status === 0xf2 || status in WORDS

// A word of a clock as its bytes. The desktop app puts after them the moment it came in, in
// millionths of a second; a browser hands the moment over beside them, in thousandths.
export function readClockWord(bytes: Uint8Array, at?: number): ClockWord | null {
    const status = bytes[0]
    const length = status === 0xf2 ? 3 : 1
    if (!isClockByte(status) || bytes.length < length) return null
    let moment = at
    if (moment === undefined) {
        if (bytes.length < length + 8) return null
        moment = Number(new DataView(bytes.buffer, bytes.byteOffset + length, 8).getBigUint64(0, true)) / 1000
    }
    // Where the song is comes in sixteenth notes.
    if (status === 0xf2) return { kind: 'place', quarters: ((bytes[1] & 0x7f) | ((bytes[2] & 0x7f) << 7)) / 4, at: moment }
    return { kind: WORDS[status], at: moment }
}

export type Follows = {
    // The clock started, or went on from where it was: the song starts that many quarter notes in,
    // at the clock's tempo when it ticked before it started.
    start(quarters: number, bpm: number | null): void
    stop(): void
    // Every sixteenth note while it runs: how fast it goes, in quarter notes a minute, and how far
    // it is, in quarter notes.
    beat(bpm: number, quarters: number): void
}

// How fast a clock goes is taken from the gaps between its ticks over the last beat, leaving out
// the longest and the shortest quarter of them, so that a tick that comes late does not shake
// the tempo. A gap of more than a quarter of a second is not a tick of a song.
const GAPS = 24
const LONGEST_GAP = 250

function tempoOf(gaps: number[]): number | null {
    if (gaps.length < 6) return null
    const sorted = [...gaps].sort((a, b) => a - b)
    const kept = sorted.slice(Math.floor(sorted.length / 4), sorted.length - Math.floor(sorted.length / 4))
    return 60000 / (24 * (kept.reduce((sum, gap) => sum + gap, 0) / kept.length))
}

export function followClock(on: Follows): (word: ClockWord) => void {
    let running = false
    let place = 0
    let ticks = 0
    let last: number | null = null
    const gaps: number[] = []
    return (word) => {
        if (word.kind === 'tick') {
            if (last !== null) {
                const gap = word.at - last
                if (gap > 0 && gap < LONGEST_GAP) {
                    gaps.push(gap)
                    if (gaps.length > GAPS) gaps.shift()
                } else gaps.length = 0
            }
            last = word.at
            if (!running) return
            // The first tick after a start is where the song begins.
            const quarters = place + ticks / 24
            ticks++
            const bpm = tempoOf(gaps)
            if (bpm !== null && (ticks - 1) % 6 === 0) on.beat(bpm, quarters)
            return
        }
        if (word.kind === 'start' || word.kind === 'go on') {
            if (word.kind === 'start') place = 0
            ticks = 0
            running = true
            on.start(place, tempoOf(gaps))
            return
        }
        if (word.kind === 'stop') {
            if (!running) return
            place += ticks / 24
            ticks = 0
            running = false
            on.stop()
            return
        }
        if (word.kind === 'place' && !running) place = word.quarters
    }
}
