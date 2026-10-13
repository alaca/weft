import { MAX_BARS } from './bars'
import { groupOf } from './grid'
import { meterNow, usualSteps } from './meter'
import type { Call, PatternBlock, Song, TextEdit } from './types'

// A song can have one run of chords that its patterns follow: a chord for every bar, written
// once, under a name, the way a list of anything bar by bar is written:
//
//   const chords = "<Am!4 F!4 C!4 G!4>"
//
// A pattern follows it by playing notes of the chord of the bar, counted from the bottom, in
// place of notes of its own, which is what Strudel calls a voicing:
//
//   bass: n("0 ~ ~ ~   0 ~ ~ ~").chord(chords).mode("root:c2").voicing()
//
// Change a chord in the one place and every pattern that follows plays the new one.
export const CHORDS = 'chords'

export const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
// The kinds of chord that are offered, by the sign Strudel knows each under.
export const KINDS: { sign: string; label: string }[] = [
    { sign: '', label: 'Major' },
    { sign: 'm', label: 'Minor' },
    { sign: '7', label: '7' },
    { sign: 'm7', label: 'Minor 7' },
    { sign: 'M7', label: 'Major 7' },
    { sign: 'sus', label: 'Sus' },
    { sign: 'o', label: 'Dim' },
    { sign: 'aug', label: 'Aug' },
    { sign: '6', label: '6' },
    { sign: '9', label: '9' },
]
export const USUAL_CHORD = 'C'

// A chord as Strudel reads one: a note name, and after it anything that is not a space or one
// of the signs a list is written with.
const CHORD = /^[A-Ga-g][b#]?[^\s!<>[\]{}(),|~*/@?:"']*$/
const TOKEN = /^(.+?)(?:!([1-9]\d*))?$/
const LINE = new RegExp(`^[ \\t]*const[ \\t]+${CHORDS}[ \\t]*=[ \\t]*"(<[^"<>\\n]*>)"[ \\t]*;?[ \\t]*$`, 'm')

export type ChordLane = { values: string[]; from: number; to: number }

// A list of chords as it is written, "<Am!4 F!4>", as the chord of every bar.
function readList(text: string): string[] | null {
    if (!/^<[^<>]*>$/.test(text)) return null
    const values: string[] = []
    for (const word of text.slice(1, -1).trim().split(/\s+/)) {
        const token = TOKEN.exec(word)
        if (!token || !CHORD.test(token[1])) return null
        const count = token[2] ? Number(token[2]) : 1
        if (values.length + count > MAX_BARS) return null
        for (let at = 0; at < count; at++) values.push(token[1])
    }
    return values.length ? values : null
}

export function readChords(code: string): ChordLane | null {
    const found = LINE.exec(code)
    const values = found ? readList(found[1]) : null
    return found && values ? { values, from: found.index, to: found.index + found[0].length } : null
}

export function chordsText(values: string[]): string {
    const runs: string[] = []
    for (let from = 0; from < values.length; ) {
        let to = from
        while (to < values.length && values[to] === values[from]) to++
        runs.push(`${values[from]}${to - from > 1 ? `!${to - from}` : ''}`)
        from = to
    }
    return `<${runs.join(' ')}>`
}

const lineOf = (values: string[]) => `const ${CHORDS} = "${chordsText(values)}"`

// The chord of a bar. A run shorter than the song goes round, as every such list does.
export const chordAt = (lane: ChordLane, bar: number): string => lane.values[((Math.floor(bar) % lane.values.length) + lane.values.length) % lane.values.length]

// The line put in, changed, or taken out with `null`. It goes in front of the first pattern,
// because a name has to be given before it is used.
export function chordsEdit(code: string, song: Song, values: string[] | null): TextEdit | null {
    const lane = readChords(code)
    if (lane) {
        if (values) return code.slice(lane.from, lane.to) === lineOf(values) ? null : { from: lane.from, to: lane.to, insert: lineOf(values) }
        const after = /^\n\n?/.exec(code.slice(lane.to))?.[0].length ?? 0
        return { from: lane.from, to: lane.to + after, insert: '' }
    }
    if (!values) return null
    const first = song.patterns.length ? Math.min(...song.patterns.map((block) => Math.min(block.from, block.labelFrom))) : code.length
    const at = code.lastIndexOf('\n', Math.max(0, first - 1)) + 1
    const before = at > 0 && code.slice(0, at).trim() ? (code.slice(0, at).endsWith('\n\n') ? '' : '\n') : ''
    return { from: at, to: at, insert: `${before}${lineOf(values)}\n\n` }
}

// ---- a pattern that follows the chords

// Where the chord sits: its lowest note is the note the chord is named after, at or under this.
export type Register = 'low' | 'middle' | 'high'
export const REGISTERS: { id: Register; label: string; under: string }[] = [
    { id: 'low', label: 'Low', under: 'c2' },
    { id: 'middle', label: 'Middle', under: 'c3' },
    { id: 'high', label: 'High', under: 'c4' },
]
// How many notes of a chord a pattern can reach, counted from the bottom. A chord has four or
// five of its own, and the ones above those are the same notes an octave up.
export const TONES = 8

type Text = Extract<Call['args'][number], { kind: 'string' }>
// `own` are the chords a pattern has written in itself, in a song that has none to follow: it
// plays those, and is the same pattern in every other way.
export type Follower = { text: Text; slow: Call | null; mode: Call | null; register: Register; cells: number[][]; steps: number; cycles: number; perCycle: number; named: Call['args'][number]; own: string[] | null }

function readCell(text: string): number[] | null {
    if (text === '~') return []
    const found = /^\d+$/.test(text) ? [text] : /^\[\d+(,\d+)*\]$/.test(text) ? text.slice(1, -1).split(',') : null
    const list = found?.map(Number)
    return list && list.every((tone) => tone < TONES) && new Set(list).size === list.length ? list : null
}

// A pattern that follows the chords, when it is written the way the app writes one.
export function readFollower(code: string, block: PatternBlock): Follower | null {
    const [source, next] = block.calls
    const text = source?.args.length === 1 ? source.args[0] : undefined
    if (!source || source.name !== 'n' || !text || text.kind !== 'string') return null
    const chord = block.calls.find((call) => call.name === 'chord')
    const named = chord?.args.length === 1 ? chord.args[0] : undefined
    const own = named?.kind === 'string' ? readList(named.value.trim()) : null
    if (!chord || !named || (code.slice(named.from, named.to) !== CHORDS && !own) || !block.calls.some((call) => call.name === 'voicing')) return null
    const slow = next?.name === 'slow' ? next : null
    const count = slow?.args[0]
    if (slow && !(slow.args.length === 1 && count?.kind === 'number' && Number.isInteger(count.value) && count.value >= 1)) return null
    const cycles = count?.kind === 'number' ? count.value : 1
    const cells = text.value.trim().split(/\s+/).map(readCell)
    if (!cells.length || cells.some((cell) => !cell) || cells.length % cycles !== 0) return null
    const mode = block.calls.find((call) => call.name === 'mode') ?? null
    const said = mode?.args[0]?.kind === 'string' ? mode.args[0].value : ''
    const register = REGISTERS.find((one) => said === `root:${one.under}`)?.id ?? 'middle'
    return { text, slow, mode, register, cells: cells as number[][], steps: cells.length, cycles, perCycle: cells.length / cycles, named, own }
}

// The chords of the song written into every pattern that follows them, for when the song's
// own are taken out: each goes on playing what it played.
export const keepOwnEdits = (code: string, blocks: PatternBlock[], values: string[]): TextEdit[] =>
    blocks.flatMap((block) => {
        const follower = readFollower(code, block)
        return follower && !follower.own ? [{ from: follower.named.from, to: follower.named.to, insert: `"${chordsText(values)}"` }] : []
    })

// The other way round, for when the song is given chords again: the patterns that had their
// own follow the song's, which begin as the chords of the first of them.
export function followAgain(code: string, blocks: PatternBlock[]): { values: string[] | null; edits: TextEdit[] } {
    const own = blocks.flatMap((block) => {
        const follower = readFollower(code, block)
        return follower?.own ? [follower] : []
    })
    return { values: own[0]?.own ?? null, edits: own.map((follower) => ({ from: follower.named.from, to: follower.named.to, insert: CHORDS })) }
}

export function tonesText(cells: number[][]): string {
    const written = cells.map((cell) => (cell.length === 0 ? '~' : cell.length === 1 ? String(cell[0]) : `[${cell.join(',')}]`))
    const groups: string[] = []
    const size = groupOf(written.length)
    for (let at = 0; at < written.length; at += size) groups.push(written.slice(at, at + size).join(' '))
    return groups.join('   ')
}

const modeText = (register: Register) => `.mode("root:${REGISTERS.find((one) => one.id === register)?.under}")`

// What a new pattern that follows the chords plays, for each of the ways one is started: the
// whole chord once a bar, the note it is named after on the beats, or its notes one by one.
export type FollowKind = 'pad' | 'bass' | 'arp'
export const FOLLOW_KINDS: { kind: FollowKind; label: string; name: string; register: Register; sound: string[]; about: string }[] = [
    { kind: 'pad', label: 'Chords', name: 'pad', register: 'middle', sound: ['.s("gm_epiano1")'], about: 'Plays the whole chord of each bar' },
    { kind: 'bass', label: 'Bass', name: 'bass', register: 'low', sound: ['.s("sawtooth")', '.lpf(slider(900, 100, 8000))'], about: 'Plays the note each chord is named after' },
    { kind: 'arp', label: 'Arp', name: 'arp', register: 'high', sound: ['.s("triangle")'], about: 'Plays the notes of each chord one by one' },
]

export function followCells(kind: FollowKind, steps: number, beats: number): number[][] {
    const beat = steps / beats
    const cells: number[][] = Array.from({ length: steps }, () => [])
    if (kind === 'pad') cells[0] = [0, 1, 2, 3]
    if (kind === 'bass' && Number.isInteger(beat)) for (let at = 0; at < steps; at += beat) cells[at] = [0]
    if (kind === 'bass' && !Number.isInteger(beat)) cells[0] = [0]
    if (kind === 'arp') {
        const up = [0, 1, 2, 3, 2, 1]
        const each = Number.isInteger(beat / 2) ? beat / 2 : 1
        for (let at = 0, note = 0; at < steps; at += each, note++) cells[at] = [up[note % up.length]]
    }
    return cells
}

export function followerCode(name: string, kind: FollowKind, mix: string[]): string {
    const made = FOLLOW_KINDS.find((one) => one.kind === kind) ?? FOLLOW_KINDS[0]
    const meter = meterNow()
    const lines = [...made.sound, ...mix].map((call) => `\n  ${call}`).join('')
    return `${name}: n("${tonesText(followCells(kind, usualSteps(meter), meter.beats))}").chord(${CHORDS})${modeText(made.register)}.voicing()${lines}`
}

export function followerEdits(follower: Follower, cells: number[][]): TextEdit[] {
    const text = tonesText(cells)
    return text === follower.text.value ? [] : [{ from: follower.text.from + 1, to: follower.text.to - 1, insert: text }]
}

// Put in another register: said after the chord, or changed where it is said.
export function registerEdit(code: string, block: PatternBlock, follower: Follower, register: Register): TextEdit | null {
    if (register === follower.register && follower.mode) return null
    if (follower.mode) return { from: follower.mode.from, to: follower.mode.to, insert: modeText(register) }
    const chord = block.calls.find((call) => call.name === 'chord')
    return chord ? { from: chord.to, to: chord.to, insert: modeText(register) } : null
}
