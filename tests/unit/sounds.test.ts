import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { applyEdit } from '../../src/song/edits'
import { fits, inUse, soundEdit } from '../../src/sounds/apply'
import { catalogue, countSounds, findSounds, kitLabel, soundLabel, type RawSound, type SoundItem } from '../../src/sounds/catalog'

const RAW: RawSound[] = [
    { name: 'triangle', type: 'synth', tag: null },
    { name: 'sine', type: 'synth', tag: null },
    { name: 'user', type: 'synth', tag: null },
    { name: 'gm_epiano1', type: 'soundfont', tag: null },
    { name: 'gm_drawbar_organ', type: 'soundfont', tag: null },
    { name: 'rolandtr909_hh', type: 'sample', tag: 'drum-machines' },
    { name: 'rolandtr909_bd', type: 'sample', tag: 'drum-machines' },
    { name: 'akaimpc60_sd', type: 'sample', tag: 'drum-machines' },
    { name: 'akaimpc60_', type: 'sample', tag: 'drum-machines' },
    { name: 'piano', type: 'sample', tag: 'instruments' },
    { name: 'snare_modern', type: 'sample', tag: null },
    { name: 'cowbell', type: 'sample', tag: null },
    { name: '_base', type: 'sample', tag: null },
    { name: 'bus', type: 'input', tag: null },
]
const ITEMS = catalogue(RAW, ['RolandTR909', 'AkaiMPC60'])
const named = (name: string) => ITEMS.find((item) => item.name === name) as SoundItem
const blockOf = (code: string) => analyze(code).patterns[0]

describe('labels', () => {
    it('spaces out the names of drum machines', () => {
        expect(kitLabel('RolandTR909')).toBe('Roland TR909')
        expect(kitLabel('AJKPercusyn')).toBe('AJK Percusyn')
        expect(kitLabel('RolandCompurhythm1000')).toBe('Roland Compurhythm 1000')
        expect(kitLabel('MoogConcertMateMG1')).toBe('Moog Concert Mate MG1')
    })

    it('turns sound names into words', () => {
        expect(soundLabel('gm_epiano1')).toBe('Electric piano 1')
        expect(soundLabel('gm_acoustic_guitar_nylon')).toBe('Acoustic guitar nylon')
        expect(soundLabel('gm_fx_rain')).toBe('Effect rain')
        expect(soundLabel('snare_modern')).toBe('Snare modern')
    })
})

describe('catalogue', () => {
    it('groups drum machine sounds into kits under their written names', () => {
        const kits = ITEMS.filter((item) => item.group === 'kits')
        expect(kits.map((kit) => kit.name)).toEqual(['AkaiMPC60', 'RolandTR909'])
        expect(named('RolandTR909').parts).toEqual([
            { sound: 'bd', label: 'Kick' },
            { sound: 'hh', label: 'Closed hat' },
        ])
        expect(named('AkaiMPC60').parts).toEqual([{ sound: 'sd', label: 'Snare' }])
    })

    it('lists the piano with the instruments, first', () => {
        expect(ITEMS.filter((item) => item.group === 'instruments').map((item) => item.name)).toEqual(['piano', 'gm_epiano1', 'gm_drawbar_organ'])
    })

    it('lists the synths it has a name for, in a fixed order', () => {
        expect(ITEMS.filter((item) => item.group === 'synths').map((item) => item.label)).toEqual(['Sine wave', 'Triangle wave'])
    })

    it('lists other samples by name and leaves out what is not a sound', () => {
        expect(ITEMS.filter((item) => item.group === 'samples').map((item) => item.name)).toEqual(['cowbell', 'snare_modern'])
        expect(ITEMS.some((item) => item.name === '_base' || item.name === 'bus' || item.name === 'user')).toBe(false)
    })
})

describe('findSounds', () => {
    it('lists a group when nothing is typed', () => {
        expect(findSounds(ITEMS, 'kits', '  ')).toHaveLength(2)
    })

    it('matches every word against the label and the name', () => {
        expect(findSounds(ITEMS, 'instruments', 'organ').map((item) => item.name)).toEqual(['gm_drawbar_organ'])
        expect(findSounds(ITEMS, 'instruments', 'piano electric').map((item) => item.name)).toEqual(['gm_epiano1'])
        expect(findSounds(ITEMS, 'kits', '909').map((item) => item.name)).toEqual(['RolandTR909'])
        expect(findSounds(ITEMS, 'kits', 'organ')).toEqual([])
    })

    it('counts the matches in every group', () => {
        expect(countSounds(ITEMS, 'piano')).toEqual({ kits: 0, instruments: 2, synths: 0, samples: 0 })
    })
})

describe('using a sound', () => {
    const drums = 'drums: s("bd*4")\n  .bank("RolandTR909")\n'
    const bass = 'bass: note("c2 e2")\n  .s("sawtooth")\n  .lpf(800)\n'

    it('offers kits to drum grids and everything else to the rest', () => {
        expect(fits(blockOf(drums), 'kits')).toBe(true)
        expect(fits(blockOf(drums), 'instruments')).toBe(false)
        expect(fits(blockOf(bass), 'kits')).toBe(false)
        expect(fits(blockOf(bass), 'samples')).toBe(true)
    })

    it('knows which sound a pattern has', () => {
        expect(inUse(blockOf(drums), named('RolandTR909'))).toBe(true)
        expect(inUse(blockOf(drums), named('AkaiMPC60'))).toBe(false)
        expect(inUse(blockOf(bass), named('sine'))).toBe(false)
    })

    it('replaces the kit of a drum grid', () => {
        expect(applyEdit(drums, soundEdit(drums, blockOf(drums), named('AkaiMPC60')))).toBe('drums: s("bd*4")\n  .bank("AkaiMPC60")\n')
    })

    it('adds a kit to a drum grid that has none, leaving its sounds alone', () => {
        const code = 'drums: s("bd*4")\n'
        expect(applyEdit(code, soundEdit(code, blockOf(code), named('RolandTR909')))).toBe('drums: s("bd*4")\n  .bank("RolandTR909")\n')
    })

    it('replaces the sound of a pattern of notes', () => {
        expect(applyEdit(bass, soundEdit(bass, blockOf(bass), named('gm_epiano1')))).toBe('bass: note("c2 e2")\n  .s("gm_epiano1")\n  .lpf(800)\n')
    })

    it('adds a sound to a pattern of notes that has none', () => {
        const code = 'lead: note("c4 e4")\n'
        expect(applyEdit(code, soundEdit(code, blockOf(code), named('sine')))).toBe('lead: note("c4 e4")\n  .s("sine")\n')
    })
})
