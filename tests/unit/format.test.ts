import { describe, expect, it } from 'vitest'
import { formatCode } from '../../src/song/format'

const laid = (code: string) => {
    const done = formatCode(code)
    if ('why' in done) throw new Error(done.why)
    return done.code
}

const MESSY = `// My song
setcpm(124/4)
drums: stack(s("bd").struct("x ~ ~ ~   x ~ ~ ~"), s("hh").struct("~ ~ x ~"),
  // s("cp").struct("~ ~ ~ ~ x"),
  s('rim'))
  .bank("RolandTR909").gain(0.8)
bass: note(\`
  c2 ~ c2 eb2
\`).slow(2).s("sawtooth")   // the bass
  // .lpf(300)
  .room(0.2)


lead: n("0 2 4").scale('C:minor').s("triangle").delay(sine.range(0.2, 0.6).slow(4))
`

const LAID = `// My song
setcpm(124/4)

drums: stack(
  s("bd").struct("x ~ ~ ~   x ~ ~ ~"),
  s("hh").struct("~ ~ x ~"),
  // s("cp").struct("~ ~ ~ ~ x"),
  s('rim'),
)
  .bank("RolandTR909")
  .gain(0.8)

bass: note(\`
  c2 ~ c2 eb2
\`)
  .slow(2)
  .s("sawtooth") // the bass
  // .lpf(300)
  .room(0.2)

lead: n("0 2 4")
  .scale('C:minor')
  .s("triangle")
  .delay(sine.range(0.2, 0.6).slow(4))
`

describe('laying out the code', () => {
    it('puts each call of a pattern on a line, the parts of a stack one to a line, and one blank line between patterns', () => {
        expect(laid(MESSY)).toBe(LAID)
    })

    it('moves only spaces and line breaks: strings keep their quotes and spacing, comments stay where they say something', () => {
        const out = laid(MESSY)
        expect(out).toContain(`s('rim')`)
        expect(out).toContain(`"x ~ ~ ~   x ~ ~ ~"`)
        expect(out).toContain('// s("cp").struct("~ ~ ~ ~ x"),')
        expect(out).toContain('.s("sawtooth") // the bass\n  // .lpf(300)\n')
    })

    it('gives the same code when laid out again', () => {
        expect(laid(LAID)).toBe(LAID)
    })

    it('leaves code with an error as it is and says why', () => {
        expect(formatCode('drums: s("bd"')).toEqual({ why: 'The code has an error, so it cannot be laid out. Fix it first.' })
    })

    it('keeps a comment among the arguments of a call in the line it was written in', () => {
        expect(laid('bass: note("c2").lpf(/* low */ 300)\n')).toBe('bass: note("c2")\n  .lpf(/* low */ 300)\n')
        expect(laid('bass: note("c2") /* a */ .s(/* b */ "x" /* c */)\n')).toBe('bass: note("c2") /* a */\n  .s(/* b */ "x" /* c */)\n')
    })
})
