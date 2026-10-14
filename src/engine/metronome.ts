import { pure, sequence } from '@strudel/core'
import { superdough } from '@strudel/webaudio'

// The click of the metronome, and the bar of clicks a song is counted in with. They are played
// by the clock that plays the song, along with it, so they follow its tempo, a tempo that
// changes bar by bar, and how its bar is counted. They are no part of the song: not in its code,
// not in a file made of it, not heard by the other person in a jam.
export const CLICK = '__weftClick'

export const isClick = (hap: any): boolean => Boolean(hap?.value && typeof hap.value === 'object' && hap.value[CLICK])

// The first beat of a bar is higher than the others.
const ONE = 93
const BEAT = 86
const LEVEL = 0.45

const sound = (hap: any, _now: number, _cps: number, at: number) => {
    const one = hap.value[CLICK] === 'one'
    void Promise.resolve(superdough({ s: 'sine', note: one ? ONE : BEAT, gain: LEVEL, attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 }, at, 0.06)).catch(() => undefined)
}

// `beats` clicks to a bar. When `until` is given, only the bars before it click: a count-in.
export function clicks(beats: number, until: number | null) {
    const bar = sequence(...Array.from({ length: Math.max(1, beats) }, (_, at) => pure({ [CLICK]: at === 0 ? 'one' : 'beat' })))
    const heard = until === null ? bar : bar.filterHaps((hap: any) => hap.whole.begin.valueOf() < until)
    return heard.onTrigger(sound, true)
}
