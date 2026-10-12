import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { checkSong } from '../../src/guard/check'
import { readKit } from '../../src/song/kit'
import { readNotes } from '../../src/song/notes'
import { addVariant, barKeys, chooseEdit, removeVariant, variantBars } from '../../src/song/variants'

const PLAIN = `setcpm(120/4)

bass: note(\`
  c2 ~  c2 ~
\`).slow(2)
  .s("sawtooth")
  .lpf(slider(800, 100, 8000))
  .mask("<1!4>")

drums: stack(
  s("bd").struct("x ~ ~ ~"),
)
  .bank("RolandTR909")
`
const apply = (code: string, edits: { from: number; to: number; insert: string }[]) => [...edits].sort((a, b) => b.from - a.from).reduce((text, edit) => text.slice(0, edit.from) + edit.insert + text.slice(edit.to), code)
const block = (code: string, id: string, shown: Record<string, number> = {}) => analyze(code, shown).patterns.find((pattern) => pattern.id === id)!
const more = (code: string, id: string, shown: Record<string, number> = {}) => apply(code, [addVariant(code, block(code, id, shown), 4)!.edit])

describe('the versions of a pattern', () => {
    it('begin as a copy of what the pattern plays, with every bar still on the first, and the song is still music code', () => {
        const two = more(PLAIN, 'bass')
        expect(two).toContain('bass: "<0!4>".pick([\n  note(`\n  c2 ~  c2 ~\n`).slow(2),\n  note(`\n  c2 ~  c2 ~\n`).slow(2),\n])\n  .s("sawtooth")')
        expect(analyze(two).error).toBeNull()
        expect(checkSong(two)).toBeNull()
        expect(variantBars(block(two, 'bass'), 4)).toEqual([0, 0, 0, 0])
        expect(variantBars(block(PLAIN, 'bass'), 4)).toEqual([0, 0, 0, 0])
    })

    it('are read so that the one in sight is the pattern: its notes, its length, and the knobs all of them share', () => {
        const two = more(PLAIN, 'bass')
        const second = block(two, 'bass', { bass: 1 })
        expect(second.variants?.shown).toBe(1)
        expect(second.calls.map((call) => call.name)).toEqual(['note', 'slow', 's', 'lpf', 'mask'])
        expect(second.soundName).toBe('sawtooth')
        expect(readNotes(second)?.grid.cycles).toBe(2)
        // What is changed in the one in sight is changed there and nowhere else.
        const notes = second.calls[0].args[0]
        const changed = two.slice(0, notes.from) + '`\n  c2 e2 g2 e2\n`' + two.slice(notes.to)
        expect(changed).toContain('note(`\n  c2 ~  c2 ~\n`).slow(2),\n  note(`\n  c2 e2 g2 e2\n`).slow(2),')
    })

    it('work for a drum kit as for notes', () => {
        const two = more(PLAIN, 'drums')
        expect(two).toContain('drums: "<0!4>".pick([\n  stack(\n  s("bd").struct("x ~ ~ ~"),\n),\n  stack(\n  s("bd").struct("x ~ ~ ~"),\n),\n])\n  .bank("RolandTR909")')
        expect(readKit(block(two, 'drums', { drums: 1 }))?.rows.map((row) => row.sound)).toEqual(['bd'])
    })

    it('are chosen bar by bar', () => {
        const two = more(PLAIN, 'bass')
        const chosen = apply(two, [chooseEdit(block(two, 'bass'), [0, 0, 1, 1])!])
        expect(chosen).toContain('bass: "<0!2 1!2>".pick([')
        expect(variantBars(block(chosen, 'bass'), 6)).toEqual([0, 0, 1, 1, 0, 0])
        expect(chooseEdit(block(chosen, 'bass'), [0, 0, 1, 1])).toBeNull()
    })

    it('are taken away again: the bars that had one take the first, and with one left the pattern is plain again', () => {
        const three = more(more(PLAIN, 'bass'), 'bass', { bass: 1 })
        expect(block(three, 'bass').variants?.items).toHaveLength(3)
        const chosen = apply(three, [chooseEdit(block(three, 'bass'), [0, 1, 2, 2])!])
        const two = apply(chosen, removeVariant(chosen, block(chosen, 'bass'), 1, 4)!)
        expect(two).toContain('bass: "<0!2 1!2>".pick([')
        expect(block(two, 'bass').variants?.items).toHaveLength(2)
        const one = apply(two, removeVariant(two, block(two, 'bass'), 1, 4)!)
        expect(one).toBe(PLAIN)
    })

    it('leave a pattern that picks in another way to the code', () => {
        const other = PLAIN.replace('note(`\n  c2 ~  c2 ~\n`).slow(2)', '"<a b>".pick({ a: note("c2"), b: note("e2") })')
        expect(block(other, 'bass').variants).toBeUndefined()
    })

    it('are read from a row whose numbers stand apart, and a long row that is no such row is turned down at once', () => {
        const read = (row: string) => block(PLAIN.replace('note(`\n  c2 ~  c2 ~\n`).slow(2)', `"${row}".pick([note("c2"), note("e2")])`), 'bass').variants
        expect(read('<0!2 1!2>')?.items).toHaveLength(2)
        expect(read(' < 0  1!3 > ')?.items).toHaveLength(2)
        expect(read('<0!21!2>')).toBeUndefined()
        const from = performance.now()
        expect(read(`<${'10 '.repeat(28)}x>`)).toBeUndefined()
        expect(performance.now() - from).toBeLessThan(1000)
    })
})

describe('the bars a picture of a pattern is asked about', () => {
    const VERSIONS = 'acid: "<1!5 0!4 1!2 0!33 1!4 0!48>".pick([\n  note("a1 a2").slow(4),\n  note("a1 d2").slow(4),\n])\n  .s("sawtooth")'
    const keys = (code: string, length: number) => barKeys(analyze(code).patterns[0], length, 16)
    const asked = (code: string, length: number) => new Set(keys(code, length)).size

    it('are the sixteen after which a pattern is taken to repeat, however long the song is', () => {
        const plain = 'bass: note("c2 e2").slow(4).s("sawtooth")'
        expect(asked(plain, 16)).toBe(16)
        expect(asked(plain, 96)).toBe(16)
    })

    it('are sixteen places for each version, and only the places a version is played at', () => {
        const all = keys(VERSIONS, 96)
        expect(new Set(all).size).toBe(27)
        expect(all[32]).toBe(all[16])
        expect(all[17]).not.toBe(all[16])
        // Bars 1 and 17 are at the same place, and take different versions.
        expect(all[16]).not.toBe(all[0])
        expect(all[60]).not.toBe(all[44])
    })

    it('are no more for a knob that only changes the sound, drawn over the song', () => {
        const drawn = `${VERSIONS}\n  .lpq("<4!14 3.7 29.4 14.6!80>")\n  .decay("<1.26!4 0.88 0.8!91>")\n  .mul(postgain("<1!48 0.5!48>"))\n  .mask("<1!95 0>")`
        expect(keys(drawn, 96)).toEqual(keys(VERSIONS, 96))
    })

    it('are more for a list that can move a note', () => {
        const skipped = keys(`${VERSIONS}\n  .degradeBy("<0!32 0.5!64>")`, 96)
        expect(skipped[27]).toBe(skipped[11])
        expect(skipped[64]).toBe(skipped[48])
        expect(skipped[32]).not.toBe(skipped[16])
        const moved = keys('bass: note("c2 e2").s("sawtooth").transpose("<0!4 5!4 7!8>")', 16)
        expect(new Set(moved).size).toBe(16)
        expect(asked(`${VERSIONS}\n  .transpose("<0!48 5!48>")`, 96)).toBe(11 + 16 + 16)
    })

    it('are more for the bars a pattern rests in when something is written after them', () => {
        const rests = '\n  .mask("<0!32 1!64>")'
        expect(keys(`${VERSIONS}${rests}`, 96)).toEqual(keys(VERSIONS, 96))
        // Bar 17 rests and bar 33 plays, and the pattern is then asked with its rests in it.
        const after = keys(`${VERSIONS}${rests}\n  .hpf(40)`, 96)
        expect(after[32]).not.toBe(after[16])
        expect(after[64]).toBe(after[48])
    })
})
