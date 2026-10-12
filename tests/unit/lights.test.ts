import { afterEach, describe, expect, it, vi } from 'vitest'
import { lightNotes } from '../../src/engine/lights'

// A note as Strudel hands it over, with what is read of it here. As in Strudel, a length that
// is written into its value counts for more than the note's own.
class Note {
    constructor(
        readonly begin: number,
        readonly end: number,
        public value: any = { s: 'bd' },
    ) {}
    get whole() {
        return { begin: this.begin, end: this.end }
    }
    get endClipped() {
        return this.begin + (typeof this.value?.duration === 'number' ? this.value.duration : this.end - this.begin)
    }
    hasOnset() {
        return true
    }
    withValue(change: (value: any) => any) {
        return new Note(this.begin, this.end, change(this.value))
    }
}

// The parts of Strudel that are reached into, made the way Strudel 1.2.6 makes them: after the
// code is played, what has not begun is dropped and the next tenth of a bar is asked for.
function strudel(song: Note[] = []) {
    const asked: [number, number][] = []
    const scheduler = {
        at: 0,
        started: true,
        lastEnd: 0,
        now() {
            return this.at
        },
        pattern: {
            queryArc(from: number, to: number) {
                asked.push([from, to])
                return song.filter((note) => note.begin >= from && note.begin < to)
            },
        },
    }
    const drawer = {
        visibleHaps: [] as Note[],
        painters: [] as unknown[],
        drawTime: [0, 0],
        scheduler,
        framer: { onFrame: (): void => void scheduler.pattern.queryArc(scheduler.at - 0.1, scheduler.at) },
        invalidate(from = scheduler, t = from.now()) {
            this.visibleHaps = this.visibleHaps.filter((note) => note.begin < t).concat(from.pattern.queryArc(Math.max(t, 0), t + 0.1))
        },
    }
    const lit: number[][] = []
    const drawn: number[][] = []
    const mirror = {
        drawer,
        repl: { scheduler },
        highlight: (notes: Note[]) => void lit.push(notes.map((note) => note.begin)),
        onDraw: (notes: Note[]) => void drawn.push(notes.map((note) => note.begin)),
    }
    const frame = (at: number) => {
        scheduler.at = at
        drawer.framer.onFrame()
    }
    return { mirror, drawer, scheduler, asked, lit, drawn, frame }
}

const root = {} as HTMLElement

// What comes back says whether the code is in sight, as the browser would.
function sight(): (shown: boolean) => void {
    let tell: (entries: { isIntersecting: boolean }[]) => void = () => undefined
    vi.stubGlobal(
        'IntersectionObserver',
        class {
            constructor(heard: typeof tell) {
                tell = heard
            }
            observe() {}
        },
    )
    return (shown) => tell([{ isIntersecting: shown }])
}

afterEach(() => vi.unstubAllGlobals())

describe('the notes lit in the code', () => {
    it('are the ones handed over that sound, said to the editor only when they change, and the song is asked nothing', () => {
        const { mirror, asked, lit, drawn, frame } = strudel()
        const heard = lightNotes(mirror, root)
        heard(new Note(0, 0.5))
        heard(new Note(0.5, 1))
        for (const at of [-0.01, 0.1, 0.2, 0.3, 0.6, 0.9, 1.1, 1.2]) frame(at)
        expect(lit).toEqual([[], [0], [0.5], []])
        expect(asked).toEqual([])
        expect(drawn).toEqual([])
    })

    it('stay lit for the length of the note, whatever the sound engine writes into it afterwards', () => {
        const { mirror, lit, frame } = strudel()
        const heard = lightNotes(mirror, root)
        const note = new Note(0, 0.25)
        heard(note)
        note.value.duration = 0.5
        frame(0.1)
        frame(0.3)
        expect(lit).toEqual([[0], []])
    })

    it('are handed to the pictures drawn in the code on every frame', () => {
        const { mirror, drawer, drawn, frame } = strudel()
        const heard = lightNotes(mirror, root)
        drawer.painters = [() => undefined]
        heard(new Note(0, 0.5))
        frame(0.1)
        frame(0.2)
        expect(drawn).toEqual([[0], [0]])
    })

    it('are asked for once more after the code is played again, on the next frame and as far as the clock has handed notes over, and said again', () => {
        const song = [0, 0.125, 0.25, 0.375].map((begin) => new Note(begin, begin + 0.125))
        const { mirror, drawer, scheduler, asked, lit, frame } = strudel(song)
        lightNotes(mirror, root)
        scheduler.lastEnd = 0.3
        drawer.invalidate()
        expect(asked).toEqual([[0, 0.1]])
        frame(0.01)
        expect(asked).toEqual([
            [0, 0.1],
            [0.1, 0.3],
        ])
        expect(drawer.visibleHaps.map((note) => note.begin)).toEqual([0, 0.125, 0.25])
        frame(0.02)
        expect(asked).toHaveLength(2)
        drawer.invalidate(scheduler, 0.03)
        frame(0.04)
        expect(lit).toEqual([[0], [0]])
    })

    it('are neither kept nor said while the code is out of sight, and asked for when it comes back', () => {
        const see = sight()
        const { mirror, drawer, asked, lit, frame } = strudel([new Note(0.55, 0.75)])
        const heard = lightNotes(mirror, root)
        see(false)
        heard(new Note(0, 0.25))
        frame(0.1)
        expect(drawer.visibleHaps).toEqual([])
        expect(lit).toEqual([])
        expect(asked).toEqual([])
        frame(0.5)
        drawer.invalidate()
        expect(drawer.visibleHaps).toEqual([])
        see(true)
        expect(asked).toEqual([
            [0.5, 0.6],
            [0.5, 0.6],
        ])
        frame(0.56)
        expect(lit).toEqual([[0.55]])
    })

    it('are still handed to a picture while the code is out of sight, for one drawn over the whole window, and not said to the editor', () => {
        const see = sight()
        const { mirror, drawer, scheduler, asked, lit, drawn, frame } = strudel([new Note(0.25, 0.5)])
        const heard = lightNotes(mirror, root)
        drawer.painters = [() => undefined]
        see(false)
        heard(new Note(0, 0.25))
        frame(0.1)
        expect(drawn).toEqual([[0]])
        scheduler.lastEnd = 0.4
        drawer.invalidate(scheduler, 0.12)
        frame(0.3)
        expect(drawn).toEqual([[0], [0.25]])
        expect(asked).toEqual([
            [0.12, 0.22],
            [0.22, 0.4],
        ])
        expect(lit).toEqual([])
    })

    it('do not pile up when no frame is drawn', () => {
        const { mirror, drawer, scheduler } = strudel()
        const heard = lightNotes(mirror, root)
        for (let step = 0; step < 2000; step++) {
            scheduler.at = step / 16
            heard(new Note(step / 16 + 0.125, step / 16 + 0.1875))
        }
        expect(drawer.visibleHaps.length).toBeLessThan(500)
    })

    it('are left to Strudel when it is made another way than the one known here', () => {
        const { mirror, drawer, scheduler, asked, frame } = strudel()
        const invalidate = drawer.invalidate
        ;(scheduler as any).lastEnd = undefined
        const heard = lightNotes(mirror, root)
        heard(new Note(0, 0.5))
        frame(0.5)
        expect(drawer.visibleHaps).toEqual([])
        expect(drawer.invalidate).toBe(invalidate)
        expect(asked).toEqual([[0.4, 0.5]])
    })
})
