import { afterEach, describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { applyEdits, setTempo } from '../../src/song/edits'
import { readKit, kitText } from '../../src/song/kit'
import { beatSteps, drumSteps, fitsBar, meterEdits, METERS, noteSteps, readMeter, setMeterNow, sliceSteps, USUAL, usualSteps } from '../../src/song/meter'

const meter = (label: string) => METERS.find((one) => one.label === label)!
const put = (code: string, label: string) => applyEdits(code, meterEdits(code, analyze(code), meter(label)))

afterEach(() => setMeterNow(USUAL))

describe('how a bar is counted', () => {
    it('is four quarters unless the song says otherwise, in a line under its tempo', () => {
        expect(readMeter('setcpm(120/4)\n').label).toBe('4/4')
        expect(readMeter('setcpm(120/3)\n// time 3/4\n').label).toBe('3/4')
        expect(readMeter('// time 9/16\n').label).toBe('4/4')
    })

    it('the tempo counts quarter notes, so it stays the number it was when the bar gets another length', () => {
        const waltz = put('setcpm(120/4)\n\ndrums: s("bd*4")\n', '3/4')
        expect(waltz).toBe('setcpm(120/3)\n// time 3/4\n\ndrums: s("bd*4")\n')
        expect(analyze(waltz).tempo?.bpm).toBe(120)
        expect(applyEdits(waltz, [setTempo(analyze(waltz), 90)])).toContain('setcpm(90/3)\n// time 3/4')
        const jig = put(waltz, '6/8')
        expect(jig).toContain('setcpm(120/3)\n// time 6/8\n')
        const odd = put(jig, '7/8')
        expect(odd).toContain('setcpm(120/3.5)\n// time 7/8\n')
        expect(analyze(odd).tempo?.bpm).toBe(120)
        expect(put(odd, '4/4')).toBe('setcpm(120/4)\n\ndrums: s("bd*4")\n')
    })

    it('says how many steps a bar has, and which numbers of steps are offered', () => {
        expect([usualSteps(meter('4/4')), usualSteps(meter('3/4')), usualSteps(meter('6/8')), usualSteps(meter('7/8'))]).toEqual([16, 12, 12, 14])
        expect(drumSteps(meter('4/4'))).toEqual([12, 16, 24, 32])
        expect(noteSteps(meter('4/4'))).toEqual([4, 8, 12, 16, 24, 32])
        expect(drumSteps(meter('3/4'))).toEqual([9, 12, 18, 24])
        expect(drumSteps(meter('6/8'))).toEqual([6, 12, 24])
        expect(sliceSteps(meter('5/4'))).toEqual([10, 20, 40])
    })

    it('a grid is read in the meter of its song: its steps, and how they stand together as beats', () => {
        expect(fitsBar(12)).toBe(true)
        expect(fitsBar(14)).toBe(false)
        expect(beatSteps(16)).toBeNull()
        setMeterNow(meter('7/8'))
        expect(fitsBar(14)).toBe(true)
        expect(fitsBar(16)).toBe(false)
        expect(beatSteps(14)).toBe(2)
        setMeterNow(meter('3/4'))
        expect(beatSteps(12)).toBe(4)
        const waltz = `drums: ${kitText([{ sound: 'bd', steps: [true, false, false, false, false, false, false, false, false, false, false, false] }])}\n`
        expect(waltz).toContain('.struct("x ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~")')
        expect(readKit(analyze(waltz).patterns[0])?.steps).toBe(12)
        // Two bars of it.
        expect(fitsBar(24, 2)).toBe(true)
    })
})
