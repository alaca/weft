import { State, TimeSpan } from '@strudel/core'
import { m } from '@strudel/mini'
import { transpiler } from '@strudel/transpiler'
import { describe, expect, it, vi } from 'vitest'
import { answerLists, transpile, weftMini } from '../../src/engine/lists'
import { DEMOS, STARTER } from '../songs'

// Nothing here says what a list should answer. Every text is read twice, by Strudel's own
// reader and by the one of the app, and the two answers have to be the same: the bars, the
// part of a bar that was asked for, the value, the places in the code, the order they come in,
// and the count of steps.
//
// Strudel's reading of a long list is slow, which is why the app has one of its own, and here
// it is asked thousands of times.
vi.setConfig({ testTimeout: 30000 })

type Span = [number, number]

const time = (span: any) => (span ? `${span.begin.toFraction()} to ${span.end.toFraction()}` : 'none')
const said = (value: unknown) => (Object.is(value, -0) ? '-0' : JSON.stringify(value))
const say = (hap: any) => [time(hap.whole), time(hap.part), said(hap.value), JSON.stringify(hap.context), hap.stateful].join(' | ')
const answers = (pattern: any, spans: Span[]) => spans.map(([from, to]) => pattern.query(new State(new TimeSpan(from, to))).map(say))
const reading = (read: (text: string, offset?: number) => any, text: string, offset: number | undefined, spans: Span[]) => {
    try {
        const pattern = read(text, offset)
        return { steps: pattern._steps?.toFraction(), answers: answers(pattern, spans) }
    } catch (err) {
        return { mistake: String((err as Error).message) }
    }
}
const same = (text: string, offset: number | undefined, spans: Span[]) => {
    const [ours, strudels] = [weftMini, m].map((read) => reading(read, text, offset, spans))
    if (JSON.stringify(ours) !== JSON.stringify(strudels)) expect([text, offset, ours]).toEqual([text, offset, strudels])
    return strudels
}
// A list is a text Strudel can read, so two readings that both failed would prove nothing.
const sameList = (text: string, offset: number, spans: Span[]) => expect([text, same(text, offset, spans).mistake]).toEqual([text, undefined])

// Always the same numbers, so that a run that fails can be run again.
function dice(seed: number) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// Every bar of a list, the bars before nought and the list gone round again, parts of bars,
// stretches of several bars, moments with no length, and the bars where one run ends and the
// next begins.
function spansOver(counts: number[], roll: () => number): Span[] {
    const bars = counts.reduce((sum, count) => sum + count, 0)
    const near = Math.min(bars, 12)
    const spans: Span[] = []
    for (let bar = -near - 1; bar < 2 * near + 1; bar++) spans.push([bar, bar + 1])
    for (let i = 0; i < 16; i++) {
        const from = Math.round((roll() * 3 - 1) * near * 1000) / 1000
        spans.push([from, from + [0.01, 0.03, 0.37, 1, 1.5, 2.25, 7.125, near + 0.5][i % 8]])
    }
    let start = 0
    for (const count of counts.slice(0, 4)) {
        start += count
        spans.push([start - 1, start + 1], [start, start], [start - 0.5, start + 0.25], [start - 0.25, start - 0.25], [-start, -start + 1], [start + bars - 2, start + bars + 3])
    }
    spans.push([0, 0], [1, 1], [-1, -1], [0.5, 0.5], [0, Math.min(2 * bars, 60)], [-3, 3], [bars - 1, bars + 1], [bars * 1000 + 0.25, bars * 1000 + 2.5])
    return spans
}

const VALUES = ['0', '1', '2', '7', '400', '2400', '12000', '-3', '-1', '.5', '5.', '-.25', '0.50', '1.26', '0.88', '-0', '00', '007', '3.14159', '-12.5']
const COUNTS = [1, 2, 3, 4, 7, 8, 12, 16, 37, 96]
const GAPS = [' ', ' ', ' ', ' ', '  ', '   ']
const EDGES = ['', '', '', ' ', '  ']
const OFFSETS = [0, 7, 1234]

function someList(roll: () => number): { text: string; counts: number[] } {
    const pick = <T>(from: T[]) => from[Math.floor(roll() * from.length)]
    const runs = Array.from({ length: pick([1, 1, 2, 3, 4, 5, 8, 13, 24]) }, () => ({ value: pick(VALUES), count: roll() < 0.6 ? null : pick(COUNTS) }))
    const inside = runs.map((run, at) => `${at ? pick(GAPS) : ''}${run.value}${run.count === null ? '' : `!${run.count}`}`).join('')
    return { text: `${pick(EDGES)}<${pick(EDGES)}${inside}${pick(EDGES)}>${pick(EDGES)}`, counts: runs.map((run) => run.count ?? 1) }
}

describe('a list written over the bars', () => {
    it('answers what Strudel answers, for lists of every make', () => {
        const roll = dice(20261012)
        for (let i = 0; i < 80; i++) {
            const { text, counts } = someList(roll)
            sameList(text, OFFSETS[i % OFFSETS.length], spansOver(counts, roll))
        }
    })

    it('answers what Strudel answers when a run is a hundred million bars, and when a list has hundreds of runs', () => {
        const roll = dice(7)
        const long = Array.from({ length: 120 }, (_, at) => ({ value: String((at * 37) % 11), count: 1 + ((at * 7) % 5) }))
        const lists: [string, number[]][] = [
            ['<0!100000000 1>', [100000000, 1]],
            ['<1 0!4096 2!4095>', [1, 4096, 4095]],
            ['<5!9007199254740990 6>', [9007199254740990, 1]],
            ['<0!96>', [96]],
            ['<3>', [1]],
            [`<${long.map((run) => `${run.value}!${run.count}`).join(' ')}>`, long.map((run) => run.count)],
        ]
        for (const [text, counts] of lists) sameList(text, 11, spansOver(counts, roll))
    })

    it('is Strudel to read when it is written any other way, and so is every text that is no list', () => {
        const spans: Span[] = [[0, 1], [1, 2], [2, 3], [3, 4], [-1, 0], [0.25, 2.5], [1, 1], [0, 9]]
        const texts = [
            '<1\t2>', '<1\n2!2\n 3>', '<1 2!2\t\n 3 >', '\t<1 2>', '<1 2>\n', '<1\u00a02>', '<1\r\n2>', '<1\f2>', '<1\u20032>',
            '<0!04 1>', '<1!0 2>', '<1 !2>', '<1! 2>', '<1!2!3>', '<1!>', '<1!!>', '<1!2.5>', '<1!-1 2>', '<1!1e2>', '<1!9007199254740993 2>',
            '<1 2>!2', '<1 2>*2', '<1 2>/2', '<1 [2 3]>', '<1, 2>', '<1 | 2>', '<1 . 2>', '<^1 2>', '<1 ~>', '<1 ->', '<1 _>', '<1@3 2>',
            '<1e3>', '<0x10>', '<c2 e2>', '<1..3>', '<1 .. 3>', '<1?>', '<1(3,8)>', '<1:2>', '<1*2 3>', '<+1>', '<--1>', '<1-2>', '<1.2.3>', '<.>', '<->',
            '<>', '< >', '', ' ', '<1 2', '1 2>', '<<1 2>>', '<1 2> <3>', '<1 2><3>', '400', '-1', '1 2 3', '0!4 1', 'bd*2 hh', 'x ~ x ~', '[1 2]',
            '<\uff11 \uff12>', '<1 2>;', "<1 '2>",
        ]
        for (const text of texts) for (const offset of [0, 31]) same(text, offset, spans)
        for (const text of ['<1 2!3 0>', 'bd*2 hh']) for (const offset of [-1, undefined, 1.5]) same(text, offset, spans)
    })

    it('reads every text of the songs that came with the app as Strudel reads it', () => {
        const spans: Span[] = [[0, 1], [3, 4], [15, 16], [64, 65], [0.25, 2.5], [5, 5], [0, 9]]
        const texts = new Map<string, number>()
        for (const code of [STARTER, ...DEMOS.map((demo) => demo.code)]) {
            for (const found of code.matchAll(/"([^"\\\n]*)"/g)) if (!texts.has(found[1])) texts.set(found[1], found.index)
        }
        for (const [text, offset] of texts) same(text, offset, spans)
        expect([...texts.keys()].filter((text) => /^<[\d.! -]+>$/.test(text)).length).toBeGreaterThan(8)
    })
})

describe('the code as Strudel prepares it, with lists answered by the app', () => {
    const DRAWN = ['setcpm(120/4)', '', 'bass: "<0!8 1!8>".pick([', '  note("c2 e2"),', '  note(`c2 <e2 g2>`),', '])', '  .s("sawtooth").lpf("<400!4 900!2 2400 3000>").lpq(slider(8, 0, 30))', '  .decay("< 0.1  .25!3 >").mask("<1!6 0!2>")'].join('\n')
    const BROKEN = ['setcpm(120/4)', '', 'bass: note("c2 [e2")', '  .lpf("<400!4 900!2>")'].join('\n')
    const prepared = (prepare: (code: string, options: unknown) => any, code: string) => {
        try {
            const { output, miniLocations, widgets } = prepare(code, {})
            return { output: output.replaceAll('weftMini(', 'm('), miniLocations, widgets }
        } catch (err) {
            return { mistake: String((err as Error).message) }
        }
    }

    it('lights up the same places, makes the same sliders, and reports a mistake in a text at the line it is on', () => {
        const songs = [STARTER, ...DEMOS.map((demo) => demo.code), DRAWN, BROKEN]
        const strudels = songs.map((code) => prepared(transpiler, code))
        answerLists()
        songs.forEach((code, at) => expect([at, prepared(transpile, code)]).toEqual([at, strudels[at]]))
        expect((transpile(DRAWN, {}) as { output: string }).output).toContain("weftMini('<400!4 900!2 2400 3000>', ")
        expect(strudels[songs.indexOf(BROKEN)].mistake).toContain('line 3')
    })
})
