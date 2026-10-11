import { describe, expect, it } from 'vitest'
import { CONTROLS } from '../../src/controls/catalog'
import { checkSong } from '../../src/guard/check'
import { FUNCTIONS, METHODS } from '../../src/guard/names'
import { DEMOS } from '../songs'
import { NEW_SONG } from '../../src/library/shelf'
import { PATTERN_STARTERS, soundStarter, starterCode } from '../../src/song/patterns'
import { STARTER } from '../songs'

const refusedAt = (code: string) => checkSong(code)?.line ?? null
const why = (code: string) => checkSong(code)?.what ?? null

describe('what the app itself writes is music code', () => {
    it('the starter song, an empty song and every demo', () => {
        expect(checkSong(STARTER)).toBeNull()
        expect(checkSong(NEW_SONG)).toBeNull()
        for (const demo of DEMOS) expect([demo.name, checkSong(demo.code)]).toEqual([demo.name, null])
    })

    it('every pattern that can be added', () => {
        for (const starter of PATTERN_STARTERS) expect(checkSong(starterCode(starter.kind, 'part'))).toBeNull()
        for (const kind of ['kit', 'notes', 'sample'] as const) expect(checkSong(`part: ${soundStarter('RolandTR909', kind).code('part').replace(/^part:\s*/, '')}`)).toBeNull()
    })

    it('every control, as a knob that stands still and as one that moves', () => {
        for (const def of CONTROLS) {
            for (const name of def.names) {
                expect([name, METHODS.has(name)]).toEqual([name, true])
                expect(checkSong(`a: s("bd").${name}(slider(0.5, 0, 1))`)).toBeNull()
                expect(checkSong(`a: s("bd").${name}(sine.range(0.2, 0.8).slow(4))`)).toBeNull()
            }
        }
    })

    it('what the controls write around a pattern', () => {
        const code = [
            'setcpm(124/4)',
            'drums: stack(',
            '  s("bd").struct("x ~ ~ ~   x ~ ~ ~").postgain("1 1.5 1 1").duckorbit(2).duckattack(0.2).duckdepth(slider(0.8, 0, 1)),',
            '  s("hh").struct("x x x x").hush(),',
            ')',
            '  .bank("RolandTR909").swingBy(slider(0.2, 0, 0.5), 8).nudge(rand.range(0, slider(0.012, 0, 0.05)))',
            '  .velocity(rand.range(slider(0.75, 0.3, 1), 1)).degradeBy(slider(0.1, 0, 1)).mask("<0!4 1!12>")',
            '_bass: note(`',
            '  c2 ~ c2 ~',
            '`).slow(2).s("sawtooth").orbit(2).cut(1).fm(2).fmh(1.5).fmdecay(0.2)',
            '$: s("cp").lastOf(4, x => x.rev())',
        ].join('\n')
        expect(checkSong(code)).toBeNull()
    })
})

describe('what a person may write by hand', () => {
    it('names for values, small functions, sums and choices', () => {
        expect(checkSong('const kick = s("bd*4")\nlet speed = 2 * Math.PI / 3\nstack(kick, s("hh*8").fast(speed > 1 ? 2 : 1))')).toBeNull()
        expect(checkSong('const twice = (pattern, by = 2, ...rest) => pattern.fast(by)\ntwice(s("bd"), 3)')).toBeNull()
        expect(checkSong('note("c e g").sometimesBy(0.3, x => x.add(note(12))).jux(rev)')).toBeNull()
        expect(checkSong('s("bd").gain([0.5, 1][0]).set({ room: 0.2, "size": 2 })')).toBeNull()
        expect(checkSong('all(x => x.room(0.2))\n// a note to self\nhush()')).toBeNull()
    })

    it('a name is known only after the line that gives it', () => {
        expect(refusedAt('s("bd").fast(mine)\nconst mine = 2')).toBe(1)
        expect(checkSong('const mine = 2\ns("bd").fast(mine)')).toBeNull()
        expect(checkSong('const fetch = 2\ns("bd").fast(fetch)')).toBeNull()
        expect(refusedAt('fetch("https://example.com")\nconst fetch = 2')).toBe(1)
    })
})

describe('what is not music code', () => {
    it('reaching outside the song', () => {
        expect(why('fetch("https://example.com")')).toBe('fetch is not something a song can use')
        for (const name of ['window', 'globalThis', 'document', 'self', 'top', 'eval', 'Function', 'localStorage', 'navigator', 'XMLHttpRequest', 'WebSocket', 'setTimeout', 'alert', '__TAURI__', 'arguments', 'require', 'process']) {
            expect([name, refusedAt(`s("bd")\n${name}`)]).toEqual([name, 2])
        }
    })

    it('the parts of Strudel that load, run or reach things', () => {
        for (const name of ['samples', 'register', 'evaluate', 'evalScope', 'repl', 'registerSound', 'soundMap', 'getAudioContext', 'getDrawContext', 'injectStyle', 'backgroundImage', 'loadBuffer', 'Pattern', 'superdough', 'setStringParser', 'strudelScope', 'logger']) {
            expect([name, FUNCTIONS.has(name), refusedAt(`${name}("x")`)]).toEqual([name, false, 1])
        }
        for (const name of ['onTrigger', 'onPaint', 'draw', 'markcss', 'bbexpr', 'expression', 'withHap', 'queryArc', 'setContext', 'log', 'src', 'worklet']) {
            expect([name, why(`s("bd").${name}("x")`)]).toEqual([name, `.${name} is not something a song can use`])
        }
    })

    it('the ways from a harmless value to the making of code', () => {
        expect(refusedAt('"".constructor.constructor("return window")()')).toBe(1)
        expect(refusedAt('s("bd").constructor')).toBe(1)
        expect(refusedAt('(x => x).constructor("alert(1)")()')).toBe(1)
        expect(refusedAt('s("bd")["constructor"]')).toBe(1)
        expect(refusedAt('s("bd")["con" + "structor"]')).toBe(1)
        expect(refusedAt('s("bd")[`constructor`]')).toBe(1)
        expect(refusedAt('s("bd")?.constructor')).toBe(1)
        expect(refusedAt('({}).__proto__')).toBe(1)
        expect(refusedAt('({ __proto__: null })')).toBe(1)
        expect(refusedAt('({ "__proto__": s("bd") })')).toBe(1)
        expect(refusedAt('({ constructor: 1 })')).toBe(1)
        expect(refusedAt('({ get a() { return 1 } })')).toBe(1)
        expect(refusedAt('({ a() { return 1 } })')).toBe(1)
        expect(refusedAt('({ [s]: 1 })')).toBe(1)
        expect(refusedAt('(({ constructor }) => constructor)(s("bd"))')).toBe(1)
        expect(refusedAt('const { constructor } = s("bd")')).toBe(1)
        expect(refusedAt('const [first] = [1]')).toBe(1)
        expect(refusedAt('s("bd").\\u0063onstructor')).toBe(1)
        expect(refusedAt('\\u0077indow')).toBe(1)
        expect(refusedAt('Math.constructor')).toBe(1)
        expect(refusedAt('Math["random"]')).toBe(1)
        expect(refusedAt('Math')).toBe(1)
        expect(refusedAt('(0, eval)("1")')).toBe(1)
        expect(refusedAt('new Function("return 1")')).toBe(1)
        expect(refusedAt('import("data:text/javascript,1")')).toBe(1)
        expect(refusedAt('m`x`')).toBe(1)
        expect(refusedAt('/a/.constructor')).toBe(1)
        expect(refusedAt('this')).toBe(1)
        expect(refusedAt('await s("bd")')).toBe(1)
        expect(refusedAt('"constructor" in s')).toBe(1)
        expect(refusedAt('s instanceof s')).toBe(1)
        expect(refusedAt('delete s.fast')).toBe(1)
    })

    it('changing things, and code that is more than expressions', () => {
        expect(why('window.x = 1')).toBe('changing a value with = is not music code')
        expect(refusedAt('s = 1')).toBe(1)
        expect(refusedAt('const a = 1\na++')).toBe(2)
        expect(refusedAt('var a = 1')).toBe(1)
        expect(why('while (true) {}')).toBe('a loop is not music code')
        expect(refusedAt('for (;;) {}')).toBe(1)
        expect(refusedAt('if (1) s("bd")')).toBe(1)
        expect(refusedAt('function f() {}')).toBe(1)
        expect(refusedAt('(function () {})()')).toBe(1)
        expect(refusedAt('class A {}')).toBe(1)
        expect(refusedAt('try { s("bd") } catch (e) {}')).toBe(1)
        expect(refusedAt('{ s("bd") }')).toBe(1)
        expect(refusedAt('a: while (true) {}')).toBe(1)
        expect(refusedAt('a: b: { }')).toBe(1)
        expect(why('s("bd").every(2, x => { return x })')).toBe('a function may only be one expression after its arrow')
        expect(refusedAt('(async () => 1)()')).toBe(1)
        expect(refusedAt('s("bd").fast(...window)')).toBe(1)
        expect(refusedAt('[...window]')).toBe(1)
        expect(refusedAt('({ ...window })')).toBe(1)
        expect(refusedAt('(x = window) => x')).toBe(1)
        expect(refusedAt('`${window}`')).toBe(1)
        expect(refusedAt('debugger')).toBe(1)
    })

    it('says which line, counting from the first', () => {
        expect(checkSong('setcpm(120/4)\n\ndrums: s("bd")\n  .fast(2)\n  .onTrigger(x => x)\n')).toEqual({ line: 5, what: '.onTrigger is not something a song can use' })
    })

    it('code that cannot be read is refused with what the reader said', () => {
        expect(checkSong('s("bd"')).toMatchObject({ line: 1 })
        expect(checkSong('<!-- x\nwindow')).not.toBeNull()
    })
})
