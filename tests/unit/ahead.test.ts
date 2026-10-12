import { beforeEach, describe, expect, it } from 'vitest'
import { getSampleInfo, registerSound, resetLoadedSounds, samples, soundMap } from 'superdough'
import { AT_ONCE, loadAhead, MOST } from '../../src/engine/ahead'

const BASE = 'https://sounds.test/'
const KIT = { RolandTR909_bd: ['909/bd0.wav', '909/bd1.wav', '909/bd2.wav'], RolandTR909_sd: ['909/sd.wav'], hh: ['hh.wav'] }
const PIANO = { piano: { A1: 'piano/a1.mp3', C3: 'piano/c3.mp3', A4: 'piano/a4.mp3' } }

// Sounds made known the way the app's lists make them known, and found the way Strudel finds
// the file of a note. What is fetched is only written down, and arrives when the test says so.
const fetching = (ready = () => true) => {
    const started: string[] = []
    const arrive = new Map<string, (ok: boolean) => void>()
    const ahead = loadAhead({
        sounds: () => soundMap.get(),
        fileOf: (value, files) => getSampleInfo(value, files).url,
        load: (url) => {
            if (!ready()) return null
            started.push(url)
            return new Promise<void>((resolve, reject) => arrive.set(url, (ok) => (ok ? resolve() : reject(new Error('no line')))))
        },
    })
    return { ahead, started, arrive }
}
const answer = (...values: unknown[]) => values.map((value) => ({ value }))
const turn = () => new Promise<void>((resolve) => setImmediate(resolve))

beforeEach(async () => {
    resetLoadedSounds()
    await samples(KIT, BASE)
    await samples(PIANO, BASE)
    registerSound('sawtooth', () => undefined, { type: 'synth' })
})

describe('the files of a song that are fetched before it is played', () => {
    it('are those of the sample notes in what a pattern answers, each once, and none for a synth or a rest', () => {
        const { ahead, started } = fetching()
        const bar = answer({ s: 'bd', bank: 'RolandTR909' }, { s: 'hh', gain: 0.4 }, { s: 'sawtooth', note: 'a1' }, { note: 'c3' }, { s: 'sd', bank: 'RolandTR909' }, { s: 'bd', bank: 'RolandTR909', gain: 0.2 }, '~', null)
        ahead.note(bar)
        expect(started).toEqual([`${BASE}909/bd0.wav`, `${BASE}hh.wav`, `${BASE}909/sd.wav`])
        ahead.note(bar)
        ahead.again()
        expect(started.length).toBe(3)
    })

    it('are the file Strudel plays for the note: by its number for a drum, by the nearest note for a piano', () => {
        const drums = fetching()
        drums.ahead.note(answer({ s: 'bd', bank: 'RolandTR909', n: 1 }, { s: 'bd', bank: 'RolandTR909', n: 4 }, { s: 'bd', bank: 'rolandtr909', n: 2.2 }))
        expect(drums.started).toEqual([`${BASE}909/bd1.wav`, `${BASE}909/bd2.wav`])
        const keys = fetching()
        keys.ahead.note(answer({ s: 'piano', note: 'c3' }, { s: 'Piano', note: 50 }, { s: 'piano', note: 'g4' }, { s: 'piano', freq: 55 }))
        expect(keys.started).toEqual([`${BASE}piano/c3.mp3`, `${BASE}piano/a4.mp3`, `${BASE}piano/a1.mp3`])
    })

    it('wait for a sound that is not known yet, and are fetched once it is', async () => {
        resetLoadedSounds()
        const { ahead, started } = fetching()
        ahead.note(answer({ s: 'bd', bank: 'RolandTR909' }, { s: 'mine' }, { s: 'gone' }))
        ahead.again()
        expect(started).toEqual([])
        await samples(KIT, BASE)
        ahead.again()
        expect(started).toEqual([`${BASE}909/bd0.wav`])
        await samples({ mine: ['blob:first'] }, '')
        ahead.again()
        ahead.again()
        expect(started).toEqual([`${BASE}909/bd0.wav`, 'blob:first'])
    })

    it('are fetched again for a sound that was made known again with another file', async () => {
        const { ahead, started } = fetching()
        await samples({ mine: ['blob:first'] }, '')
        ahead.note(answer({ s: 'mine' }))
        await samples({ mine: ['blob:second'] }, '')
        ahead.note(answer({ s: 'mine' }))
        expect(started).toEqual(['blob:first', 'blob:second'])
    })

    it('are fetched a few at a time in the order they were asked for, and one that does not arrive holds up none', async () => {
        const files = Array.from({ length: AT_ONCE + 3 }, (_, at) => `more/${at}.wav`)
        await samples({ more: files }, BASE)
        const { ahead, started, arrive } = fetching()
        ahead.note(answer(...files.map((_, n) => ({ s: 'more', n }))))
        expect(started).toEqual(files.slice(0, AT_ONCE).map((file) => BASE + file))
        arrive.get(started[1])?.(true)
        await turn()
        expect(started.length).toBe(AT_ONCE + 1)
        arrive.get(started[0])?.(false)
        await turn()
        expect(started.length).toBe(AT_ONCE + 2)
        for (const url of [...started]) arrive.get(url)?.(true)
        await turn()
        expect(started).toEqual(files.map((file) => BASE + file))
    })

    it('are left for the next answer when this is not the moment to fetch', () => {
        let moment = false
        const { ahead, started } = fetching(() => moment)
        ahead.note(answer({ s: 'hh' }))
        expect(started).toEqual([])
        moment = true
        ahead.note(answer({ s: 'sawtooth' }))
        expect(started).toEqual([`${BASE}hh.wav`])
    })

    it('are not lost to a pitch that is another one every time, and no more notes wait for a sound than there is room for', async () => {
        const { ahead, started } = fetching()
        ahead.note(answer(...Array.from({ length: MOST + 20 }, (_, at) => ({ s: 'hh', freq: 200 + at / 7 }))))
        ahead.note(answer({ s: 'bd', bank: 'RolandTR909' }))
        expect(started).toEqual([`${BASE}hh.wav`, `${BASE}909/bd0.wav`])

        const many = Array.from({ length: MOST + 20 }, (_, at) => `late/${at}.wav`)
        const late = fetching()
        late.ahead.note(answer(...many.map((_, n) => ({ s: 'late', n }))))
        await samples({ late: many }, BASE)
        late.ahead.again()
        for (let done = 0; done < late.started.length; done++) {
            late.arrive.get(late.started[done])?.(true)
            await turn()
        }
        expect(late.started).toEqual(many.slice(20).map((file) => BASE + file))
    })
})
