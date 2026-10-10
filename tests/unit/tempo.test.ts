import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { STARTER } from '../../src/song/starter'

describe('tempo', () => {
    it('reads beats per minute from setcpm', () => {
        const song = analyze(STARTER)
        expect(song.tempo).toMatchObject({ bpm: 124, unit: 'cpm' })
        expect(STARTER.slice(song.tempo!.from, song.tempo!.to)).toBe('124/4')
        expect(song.tempoLocked).toBe(false)
    })

    it('reads a plain number and setcps', () => {
        expect(analyze('setcpm(30)').tempo).toMatchObject({ bpm: 120, unit: 'cpm' })
        expect(analyze('setcps(0.5)').tempo).toMatchObject({ bpm: 120, unit: 'cps' })
        expect(analyze('setCpm(140/4)').tempo).toMatchObject({ bpm: 140 })
    })

    it('has no tempo when the code sets none', () => {
        const song = analyze('drums: s("bd*4")')
        expect(song.tempo).toBeNull()
        expect(song.tempoLocked).toBe(false)
    })

    it('is locked when the tempo cannot be read', () => {
        const song = analyze('const speed = 30\nsetcpm(speed)')
        expect(song.tempo).toBeNull()
        expect(song.tempoLocked).toBe(true)
    })

    it('knows where the first statement starts', () => {
        expect(analyze('// a song\n\ndrums: s("bd*4")').insertAt).toBe(11)
        expect(analyze('').insertAt).toBe(0)
    })
})
