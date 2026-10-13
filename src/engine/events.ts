import { noteNameToMidi } from '../song/pitch'
import type { PatternEvent } from '../song/types'

export { noteNameToMidi }

export type HapLike = {
    whole?: { begin: { valueOf(): number }; end: { valueOf(): number } }
    hasOnset(): boolean
    value: unknown
}

function pitchOf(value: unknown): number | null {
    if (typeof value !== 'object' || value === null) return null
    const v = value as { note?: unknown; freq?: unknown }
    if (typeof v.note === 'number') return v.note
    if (typeof v.note === 'string') return noteNameToMidi(v.note)
    if (typeof v.freq === 'number') return 69 + 12 * Math.log2(v.freq / 440)
    return null
}

function soundOf(value: unknown): string | null {
    if (typeof value !== 'object' || value === null) return null
    const s = (value as { s?: unknown }).s
    return typeof s === 'string' ? s : null
}

// How loud a note is, of everything its pattern says of that: Strudel's velocity and gain, and
// the level after the effects, which is where the level of a step is written and the volume of
// the pattern. A note that says nothing is 1.
export function levelOf(value: unknown): number {
    if (typeof value !== 'object' || value === null) return 1
    const said = value as { velocity?: unknown; gain?: unknown; postgain?: unknown }
    const level = [said.velocity, said.gain, said.postgain].reduce<number>((all, one) => (typeof one === 'number' && Number.isFinite(one) ? all * one : all), 1)
    return Math.max(0, level)
}

export function toEvents(haps: HapLike[], cycle: number): PatternEvent[] {
    const events: PatternEvent[] = []
    for (const hap of haps) {
        if (!hap.whole || !hap.hasOnset()) continue
        const begin = hap.whole.begin.valueOf()
        if (begin < cycle || begin >= cycle + 1) continue
        events.push({
            start: begin - cycle,
            length: hap.whole.end.valueOf() - begin,
            sound: soundOf(hap.value),
            midi: pitchOf(hap.value),
            ...(levelOf(hap.value) === 1 ? {} : { level: levelOf(hap.value) }),
        })
    }
    return events
}
