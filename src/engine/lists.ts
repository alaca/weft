import { Hap, Pattern } from '@strudel/core'
import { getLeafLocations, m } from '@strudel/mini'
import { registerLanguage, transpiler } from '@strudel/transpiler'
import { readRuns, type Run } from '../song/curves'

// A list written over the bars, "<400!8 900!4>", is made by Strudel into one pattern for every
// run, and all of them are asked each time a note wants its value: the more is drawn over a
// song, the slower it would play. Here such a list is answered from its runs, with one look
// for the run a bar is in. The answer is the one Strudel's own reading of the text gives: the
// same bars, values and places in the code, in the same order. Every other text is handed to
// Strudel's own reader.
type List = { runs: Run[]; starts: number[]; bars: number }

// Strudel counts a tab or a line end into the place of the value beside it. A list is only
// taken when its blanks are plain spaces, where the place of a value is the value alone.
const PLAIN = /^[-\d.!<> ]+$/

function readList(text: unknown): List | null {
    const runs = typeof text === 'string' && PLAIN.test(text) ? readRuns(text) : null
    if (!runs) return null
    const starts: number[] = []
    let bars = 0
    for (const run of runs) {
        starts.push(bars)
        bars += run.count
    }
    return Number.isSafeInteger(bars) ? { runs, starts, bars } : null
}

// In the code a text stands one past its opening quote.
const placeOf = (run: Run, offset: number): [number, number] => [offset + 1 + run.from, offset + 1 + run.to]

function listPattern({ runs, starts, bars }: List, offset: number) {
    const values = runs.map((run) => Number(run.value))
    const places = runs.map((run) => placeOf(run, offset)).map(([start, end]) => ({ start, end }))
    // The run a bar is in is the last one that starts at or before it. Nothing is kept bar by
    // bar: a count typed by hand can be a hundred million.
    const runOf = (bar: number) => {
        let low = 0
        let high = starts.length - 1
        while (low < high) {
            const middle = (low + high + 1) >> 1
            if (starts[middle] <= bar) low = middle
            else high = middle - 1
        }
        return low
    }
    // Strudel counts bars in whole numbers of any size, so the bar of the list is found in them.
    const length = BigInt(bars)
    return new Pattern((state: any) => {
        const found: { whole: any; part: any; run: number }[] = state.span.spanCycles.map((part: any) => {
            const whole = part.begin.wholeCycle()
            const begin: { s: bigint; n: bigint } = whole.begin
            const bar = Number((begin.s * begin.n) % length)
            return { whole, part, run: runOf(bar < 0 ? bar + bars : bar) }
        })
        // Asked for more than one bar, Strudel answers run by run.
        if (found.length > 1) found.sort((a, b) => a.run - b.run)
        return found.map(({ whole, part, run }) => new Hap(whole, part, values[run], { locations: [places[run]] }))
    }, 1)
}

export function weftMini(text: string, offset: number) {
    const list = Number.isSafeInteger(offset) && offset >= 0 ? readList(text) : null
    return list ? listPattern(list, offset) : m(text, offset)
}

// Strudel hands a text over without the code around it. The code is kept for as long as it is
// being prepared, so that a mistake in a text is reported at the line it is on.
let prepared: string | undefined

export function transpile(code: string, options: unknown): unknown {
    prepared = code
    try {
        return transpiler(code, options)
    } finally {
        prepared = undefined
    }
}

// The places the editor lights up as they play. Strudel hands the text over in brackets.
function placesIn(bracketed: string, offset: number): number[][] {
    const text = bracketed.slice(1, -1)
    const list = readList(text)
    return list ? list.runs.map((run) => placeOf(run, offset)) : getLeafLocations(`"${text}"`, offset, prepared)
}

// From here on Strudel asks here for every text in double quotes or backticks. The prepared
// code calls the reader by its name, so the name is put where Strudel's own names are.
export function answerLists(): void {
    ;(globalThis as any).weftMini = weftMini
    registerLanguage('minilang', { name: 'weftMini', getLocations: placesIn })
}
