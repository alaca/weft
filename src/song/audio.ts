import { MAX_BARS } from './bars'
import { removeCall } from './edits'
import type { Arg, Call, PatternBlock, TextEdit } from './types'

// A long recording that plays along the song: a vocal, a guitar, anything that is longer than
// a bar and is not played as notes. It is one sound of your own, and each bar plays the piece
// of it that belongs there, a bar long, so that the song can be started from any bar and the
// recording is where it should be:
//
//   vocal: s("my_take").slice(18.52083, "<~!4 0 1 2 3 4 5 6 7>")
//     .late(0.25)
//     .attack(0.02).release(0.02)
//     .mask("<0!4 1!8>")
//
// The number is how many bars the whole recording lasts at the tempo of the song, and the list
// says, bar by bar, which bar of the recording is played there: where the recording sits in
// the song. `late` moves all of it on by a part of a bar. A piece fades in over a moment while
// the one before fades out, and since the one before goes on with the same sound for that
// moment, the two are one sound. Which bars it is heard in are the bars of a pattern like any
// other, so it is cut shorter and made longer where every pattern is.
//
// A fade is the same fading in and out made longer for the first and the last bar of each
// stretch that is heard, which is why it is written as a list, a number for every bar.
type Text = Extract<Arg, { kind: 'string' }>
type Count = Extract<Arg, { kind: 'number' }>
export type Audio = {
    sound: Text
    call: Call
    count: Count
    text: Text
    // How long the recording is, in bars, and which bar of it each bar of the song plays.
    bars: number
    list: (number | null)[]
    late: Call | null
    lateBy: number
    attack: Call | null
    release: Call | null
    // Seconds, 0 for none.
    fadeIn: number
    fadeOut: number
}

// How long the pieces fade into each other, in seconds.
export const JOIN = 0.02
export const LONGEST_FADE = 30

const SOUND = /^[A-Za-z_]\w*(?::\d+)?$/
const TOKEN = /^(~|\d+(?:\.\d+)?)(?:!([1-9]\d*))?$/

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places

function readList(text: string): (number | null)[] | null {
    const found = /^\s*<([^<>]*)>\s*$/.exec(text)
    if (!found) return null
    const list: (number | null)[] = []
    for (const word of found[1].trim().split(/\s+/).filter(Boolean)) {
        const token = TOKEN.exec(word)
        if (!token) return null
        const count = token[2] ? Number(token[2]) : 1
        if (list.length + count > MAX_BARS) return null
        for (let at = 0; at < count; at++) list.push(token[1] === '~' ? null : Number(token[1]))
    }
    return list.length ? list : null
}

// The longest fade that is written for a bar, when there is one.
function fadeOf(call: Call | null): number {
    const arg = call?.args[0]
    if (!arg || arg.kind !== 'string') return 0
    const most = Math.max(0, ...(readList(arg.value) ?? []).map((value) => value ?? 0))
    return most > JOIN ? most : 0
}

export function readLaid(block: PatternBlock): Audio | null {
    const [source, call] = block.calls
    const sound = source?.args.length === 1 ? source.args[0] : undefined
    if (!source || !call || !sound || sound.kind !== 'string' || (source.name !== 's' && source.name !== 'sound') || !SOUND.test(sound.value)) return null
    if (call.name !== 'slice' || call.args.length !== 2) return null
    const [count, text] = call.args
    if (count.kind !== 'number' || !(count.value > 0) || text.kind !== 'string') return null
    const list = readList(text.value)
    if (!list) return null
    const named = (name: string) => block.calls.slice(2).find((one) => one.name === name && one.args.length === 1) ?? null
    const late = named('late')
    const by = late?.args[0]
    const attack = named('attack')
    const release = named('release')
    return { sound, call, count, text, bars: count.value, list, late, lateBy: by?.kind === 'number' ? by.value : 0, attack, release, fadeIn: fadeOf(attack), fadeOut: fadeOf(release) }
}

const runs = (values: string[], together: (value: string) => boolean): string => {
    const out: string[] = []
    for (let from = 0; from < values.length; ) {
        let to = from + 1
        if (together(values[from])) while (to < values.length && values[to] === values[from]) to++
        out.push(`${values[from]}${to - from > 1 ? `!${to - from}` : ''}`)
        from = to
    }
    return `<${out.join(' ')}>`
}

// Only bars that rest are counted together: a bar of the recording is itself and no other.
export const listText = (list: (number | null)[]): string =>
    runs(
        list.map((value) => (value === null ? '~' : String(round(value, 3)))),
        (value) => value === '~',
    )

// How many bars a recording lasts, as it is written. It is written finely, because the pieces
// are found by it: a piece that begins a moment off is heard where two of them meet.
export const barsOfSound = (seconds: number, barSeconds: number): number => round(seconds / Math.max(0.001, barSeconds), 5)

// The list for a recording whose first bar is a bar of the song: every bar from there on plays
// the next bar of it, for as long as there is recording left, and the bars before and after
// rest. A song that is too short for all of it is made as long as it takes.
export function listFrom(start: number, bars: number, length: number): (number | null)[] {
    const span = Math.min(MAX_BARS, Math.max(length, start + Math.ceil(bars)))
    return Array.from({ length: span }, (_, bar) => (bar >= start && bar - start < bars ? bar - start : null))
}

// The bar of the song that the first bar of the recording is in, read back from the list. It
// is before the song when the start of the recording was cut away.
export function startOf(list: (number | null)[]): number | null {
    const bar = list.findIndex((value) => value !== null)
    return bar < 0 ? null : bar - Math.floor(list[bar] as number)
}

// The list as long as the song. A longer one goes on with the recording where there is some
// left, a shorter one is cut.
export function relist(audio: Audio, length: number): (number | null)[] {
    return Array.from({ length: Math.min(MAX_BARS, length) }, (_, bar) => {
        if (bar < audio.list.length) return audio.list[bar]
        const last = audio.list[audio.list.length - 1]
        const next = last === null ? null : last + (bar - audio.list.length + 1)
        return next !== null && next < audio.bars ? next : null
    })
}

// The bars in which some of the recording is heard: the ones the pattern plays in that have a
// bar of the recording to play.
export const heardIn = (list: (number | null)[], bars: number, plays: boolean[]): boolean[] =>
    plays.map((on, bar) => {
        const piece = list.length ? list[bar % list.length] : null
        return on && piece !== null && piece < bars
    })

const seconds = (value: number) => String(round(value, 2))

// What is written for fading in and for fading out: the moment that joins the pieces, or a
// list with the fade in the bars that begin or end a stretch that is heard.
export function fadeTexts(heard: boolean[], fadeIn: number, fadeOut: number): { attack: string; release: string } {
    const one = (fade: number, edge: (bar: number) => boolean) =>
        fade > JOIN && heard.some(Boolean)
            ? `"${runs(
                  heard.map((on, bar) => seconds(on && edge(bar) ? fade : JOIN)),
                  () => true,
              )}"`
            : String(JOIN)
    return { attack: one(fadeIn, (bar) => !heard[bar - 1]), release: one(fadeOut, (bar) => !heard[bar + 1]) }
}

export type AudioPlan = { bars: number; list: (number | null)[]; lateBy: number; heard: boolean[]; fadeIn: number; fadeOut: number }

const lateText = (by: number) => `.late(${round(by, 4)})`

// Everything that says where a recording is and how it fades, written as the plan has it.
export function audioEdits(code: string, audio: Audio, plan: AudioPlan): TextEdit[] {
    const edits: TextEdit[] = []
    const count = String(plan.bars)
    if (Number(count) !== audio.count.value) edits.push({ from: audio.count.from, to: audio.count.to, insert: count })
    const text = listText(plan.list)
    if (text !== audio.text.value) edits.push({ from: audio.text.from + 1, to: audio.text.to - 1, insert: text })
    const fades = fadeTexts(plan.heard, plan.fadeIn, plan.fadeOut)
    const lateBy = round(plan.lateBy, 4)
    // What is not there yet goes straight after the list, in the order it is read.
    let added = ''
    if (audio.late) {
        const arg = audio.late.args[0]
        if (lateBy <= 0) edits.push(removeCall(audio.late))
        else if (code.slice(arg.from, arg.to) !== String(lateBy)) edits.push({ from: arg.from, to: arg.to, insert: String(lateBy) })
    } else if (lateBy > 0) added += `\n  ${lateText(lateBy)}`
    for (const [call, wanted, name] of [
        [audio.attack, fades.attack, 'attack'],
        [audio.release, fades.release, 'release'],
    ] as const) {
        const arg = call?.args[0]
        if (!arg) added += `.${name}(${wanted})`
        else if (code.slice(arg.from, arg.to) !== wanted) edits.push({ from: arg.from, to: arg.to, insert: wanted })
    }
    if (added) edits.push({ from: audio.call.to, to: audio.call.to, insert: added })
    return edits
}

// A new pattern for a recording that is put in the song.
export const audioCode = (name: string, sound: string, bars: number, list: (number | null)[], lateBy: number, mix: string[]): string =>
    `${name}: s("${sound}").slice(${bars}, "${listText(list)}")${lateBy > 0 ? `\n  ${lateText(lateBy)}` : ''}\n  .attack(${JOIN}).release(${JOIN})${mix.map((call) => `\n  ${call}`).join('')}`
