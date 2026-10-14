import { describe, expect, it } from 'vitest'
import { clicks, isClick } from '../../src/engine/metronome'

const heard = (pattern: any, from: number, to: number) => pattern.queryArc(from, to).filter((hap: any) => hap.hasOnset())

describe('the metronome', () => {
    it('clicks every beat of the bar, the first one higher, and plays nothing else', () => {
        const three = heard(clicks(3, null), 0, 2)
        expect(three.map((hap: any) => hap.whole.begin.valueOf())).toEqual([0, 1 / 3, 2 / 3, 1, 4 / 3, 5 / 3])
        expect(three.map((hap: any) => hap.value.__weftClick)).toEqual(['one', 'beat', 'beat', 'one', 'beat', 'beat'])
        expect(three.every(isClick)).toBe(true)
        expect(three.every((hap: any) => hap.context.dominantTrigger)).toBe(true)
    })

    it('counts a song in with the bars before it starts, and is quiet after', () => {
        const counted = heard(clicks(4, 1), 0, 3)
        expect(counted.map((hap: any) => hap.whole.begin.valueOf())).toEqual([0, 0.25, 0.5, 0.75])
    })
})
