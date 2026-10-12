import { describe, expect, it } from 'vitest'
import { getZZFX, setAudioContext } from 'superdough'
import { builtKey, keepUpTo, SHAPING } from '../../src/engine/zzfx'

const note = (more: Record<string, unknown> = {}) => ({ s: 'z_sawtooth', note: 48, duration: 0.5, ...more })

// Strudel's own working out of a note, on an audio clock that only holds on to what it is handed.
const workedOut = (value: Record<string, unknown>): number[] => {
    let samples: number[] = []
    setAudioContext({
        sampleRate: 8000,
        createBuffer: () => ({ getChannelData: () => ({ set: (given: number[]) => void (samples = given) }) }),
        createBufferSource: () => ({ start() {} }),
    })
    getZZFX(value, 0)
    return samples
}

describe('the note of a ZZFX synth that is kept', () => {
    it('is kept under the settings that shape it, whatever else the note carries', () => {
        expect(builtKey(note(), 48000)).not.toBeNull()
        expect(builtKey(note({ gain: 0.4, pan: 0.2, cutoff: 800, orbit: 3, room: 0.5, zrand: 0 }), 48000)).toBe(builtKey(note(), 48000))
    })

    it('is another one for every setting that shapes it, and for another rate of the audio clock', () => {
        const keys = new Set([builtKey(note(), 48000), builtKey(note(), 44100)])
        for (const name of SHAPING) keys.add(builtKey(note({ [name]: name === 's' ? 'z_sine' : 0.37 }), 48000))
        expect(keys.has(null)).toBe(false)
        expect(keys.size).toBe(SHAPING.length + 2)
        expect(builtKey(note({ note: '48' }), 48000)).not.toBe(builtKey(note({ note: 48 }), 48000))
    })

    it('is not kept when it has chance in its pitch, brings its own ZZFX numbers, or has a setting that is neither a number nor text', () => {
        expect(builtKey(note({ zrand: 0.1 }), 48000)).toBeNull()
        expect(builtKey(note({ zzfx: [1, 0, 220] }), 48000)).toBeNull()
        expect(builtKey(note({ slide: NaN }), 48000)).toBeNull()
        expect(builtKey(note({ note: { midi: 48 } }), 48000)).toBeNull()
    })

    it('is made by Strudel from the settings it is kept under, and from no other', () => {
        const read = new Set<string>()
        workedOut(new Proxy(note(), { get: (target, name) => (read.add(String(name)), Reflect.get(target, name)) }))
        expect([...read].sort()).toEqual([...SHAPING, 'zrand', 'zzfx'].sort())
    })

    it('is worked out by Strudel the same every time, noise as well, unless it has chance in its pitch', () => {
        for (const s of ['z_sawtooth', 'z_noise']) {
            const first = workedOut(note({ s, znoise: 0.5, slide: 0.2 }))
            expect(first.length).toBeGreaterThan(4000)
            expect(workedOut(note({ s, znoise: 0.5, slide: 0.2 }))).toEqual(first)
        }
        expect(workedOut(note({ zrand: 0.5 }))).not.toEqual(workedOut(note({ zrand: 0.5 })))
    })

    it('goes when there is no room left, the one played longest ago first', () => {
        const kept = keepUpTo<string>(10)
        kept.keep('a', 'A', 4)
        kept.keep('b', 'B', 4)
        expect(kept.find('a')).toBe('A')
        kept.keep('c', 'C', 4)
        expect(kept.find('b')).toBeUndefined()
        expect(kept.find('a')).toBe('A')
        expect(kept.find('c')).toBe('C')
        kept.keep('d', 'D', 9)
        expect(kept.find('a')).toBeUndefined()
        expect(kept.find('c')).toBeUndefined()
        expect(kept.find('d')).toBe('D')
    })

    it('is not kept when it is longer than all the room there is, and then pushes nothing out', () => {
        const kept = keepUpTo<string>(10)
        kept.keep('a', 'A', 4)
        kept.keep('long', 'L', 11)
        expect(kept.find('long')).toBeUndefined()
        expect(kept.find('a')).toBe('A')
    })
})
