import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/song/analyze'
import { addCall, applyEdits, removeCall } from '../../src/song/edits'
import { parseGrid, readGrid, removeRow, resize, toggleStep, type GridRow } from '../../src/song/grid'
import { convertEdits, isDrums, kitEdits, kitText, readKit, structText } from '../../src/song/kit'
import { favourites, panOf, volumeOf } from '../../src/controls/views'

const first = (code: string) => analyze(code).patterns[0]
const hits = (steps: boolean[]) => steps.flatMap((on, i) => (on ? [i] : []))
const row = (sound: string, at: number[], length = 16): GridRow => ({ sound, steps: Array.from({ length }, (_, i) => at.includes(i)) })
const plain = (code: string): GridRow[] => readKit(first(code))!.rows.map(({ sound, steps }) => ({ sound, steps }))
const change = (code: string, next: (rows: GridRow[]) => GridRow[]) => {
    const kit = readKit(first(code))!
    return applyEdits(code, kitEdits(code, kit, next(plain(code))))
}

const BD = '  s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~"),\n'
const CP = '  s("cp").struct("~ ~ ~ ~   x ~ ~ ~   ~ ~ ~ ~   x ~ ~ ~").hpf(slider(400, 20, 4000)).gain(0.6),\n'
const HH = '  s("hh").struct("~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n'
const KIT = `drums: stack(\n${BD}${CP}${HH})\n  .bank("RolandTR909")\n  .room(slider(0.2, 0, 1))\n`

describe('analyze', () => {
    it('reads a chain of calls given as an argument', () => {
        const stack = first(KIT).calls[0]
        expect(stack.name).toBe('stack')
        expect(stack.args.map((arg) => arg.kind)).toEqual(['chain', 'chain', 'chain'])
        const second = stack.args[1]
        expect(second.kind === 'chain' && second.calls.map((call) => call.name)).toEqual(['s', 'struct', 'hpf', 'gain'])
        expect(first(KIT).calls.map((call) => call.name)).toEqual(['stack', 'bank', 'room'])
    })

    it('still takes a slider for a slider and a signal for something set in code', () => {
        const block = first('x: note("c").lpf(slider(400, 20, 4000)).pan(sine.slow(4))')
        expect(block.calls[1].args[0].kind).toBe('slider')
        expect(panOf(block)).toMatchObject({ state: 'locked' })
    })
})

describe('readKit', () => {
    it('reads each sound, its steps and its own line', () => {
        const kit = readKit(first(KIT))!
        expect(kit).toMatchObject({ steps: 16, cycles: 1, perCycle: 16, slow: null })
        expect(kit.rows.map((r) => [r.sound, hits(r.steps)])).toEqual([
            ['bd', [0, 4, 8, 12]],
            ['cp', [4, 12]],
            ['hh', []],
        ])
        expect(KIT.slice(kit.rows[1].block.from, kit.rows[1].block.to)).toBe(CP.trim().slice(0, -1))
    })

    it('gives each sound a block of its own with only its controls', () => {
        const [bd, cp] = readKit(first(KIT))!.rows
        expect(bd.block).toMatchObject({ id: 'drums/bd', soundName: 'bd', inline: true })
        expect(favourites(bd.block)).toEqual([])
        expect(favourites(cp.block).map((view) => [view.fn, view.state])).toEqual([['hpf', 'live']])
        expect(volumeOf(cp.block)).toMatchObject({ state: 'number', value: 0.6 })
        expect(volumeOf(bd.block)).toMatchObject({ state: 'faint' })
        expect(favourites(first(KIT)).map((view) => view.fn)).toEqual(['room'])
    })

    it('reads the length from slow', () => {
        const code = 'drums: stack(\n  s("bd").struct("x ~ ~ ~   ~ ~ ~ ~"),\n).slow(2)\n'
        expect(readKit(first(code))).toMatchObject({ steps: 8, cycles: 2, perCycle: 4 })
    })

    it('reads the longest and finest grid the controls offer, four cycles of 32 steps', () => {
        const steps = (count: number) => Array(count).fill('~').join(' ')
        expect(readKit(first(`drums: stack(\n  s("bd").struct("${steps(128)}"),\n).slow(4)\n`))).toMatchObject({ steps: 128, cycles: 4, perCycle: 32 })
        expect(readKit(first(`drums: stack(\n  s("bd").struct("${steps(132)}"),\n).slow(4)\n`))).toBeNull()
    })

    it('reads a kit with no sounds as sixteen steps a cycle', () => {
        expect(readKit(first('drums: stack(\n)\n  .bank("RolandTR909")\n'))).toMatchObject({ rows: [], steps: 16, cycles: 1 })
        expect(readKit(first('drums: stack().slow(2)\n'))).toMatchObject({ rows: [], steps: 32, cycles: 2, perCycle: 16 })
    })

    it('is not a kit when a line is anything else', () => {
        for (const code of [
            'x: stack(note("c"), note("e"))',
            'x: stack(s("bd").struct("x ~ x"))',
            'x: stack(s("bd").struct("x ~ ~ ~"), s("hh").struct("x ~ ~ ~   x ~ ~ ~"))',
            'x: stack(s("bd").struct("x ~ ~ ~"), s("bd").struct("~ ~ x ~"))',
            'x: stack(s("bd hh").struct("x ~ ~ ~"))',
            'x: stack(s("bd").struct("x ~ 1 ~"))',
            'x: stack(s("bd").gain(1).struct("x ~ ~ ~"))',
            'x: stack(s("bd").struct("x ~ ~ ~")).slow(1.5)',
            'x: s("bd*4")',
        ]) {
            expect(readKit(first(code)), code).toBeNull()
        }
    })

    it('knows a drum pattern in either way of writing it', () => {
        expect(isDrums(first(KIT))).toBe(true)
        expect(isDrums(first('x: s("bd*4")'))).toBe(true)
        expect(isDrums(first('x: note("c2")'))).toBe(false)
        expect(isDrums(first('x: stack(note("c"), note("e"))'))).toBe(false)
    })
})

describe('kitText', () => {
    it('writes one line for each sound, with the steps in fours and lined up', () => {
        expect(kitText([row('bd', [0, 8]), row('perc', [4])])).toBe(
            'stack(\n  s("bd")  .struct("x ~ ~ ~   ~ ~ ~ ~   x ~ ~ ~   ~ ~ ~ ~"),\n  s("perc").struct("~ ~ ~ ~   x ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n)',
        )
        expect(structText([true, false, false, false, true, true, false, false])).toBe('x ~ ~ ~   x x ~ ~')
    })

    it('writes a kit with no sounds, and reads back what it wrote', () => {
        expect(kitText([])).toBe('stack(\n)')
        const rows = [row('bd', [0, 8]), row('perc', [4]), row('hh', [])]
        expect(plain(`drums: ${kitText(rows)}\n`)).toEqual(rows)
    })
})

describe('kitEdits', () => {
    it('changes only the steps of the sound that was clicked', () => {
        const next = change(KIT, (rows) => toggleStep(rows, 'hh', 2, 16))
        expect(next).toBe(KIT.replace(HH, '  s("hh").struct("~ ~ x ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n'))
    })

    it('keeps the line and its controls when the last hit is taken away', () => {
        const next = change(KIT, (rows) => toggleStep(toggleStep(rows, 'cp', 4, 16), 'cp', 12, 16))
        expect(next).toContain('  s("cp").struct("~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~").hpf(slider(400, 20, 4000)).gain(0.6),\n')
    })

    it('adds a line for a new sound after the last one', () => {
        const next = change(KIT, (rows) => [...rows, row('oh', [])])
        expect(next).toBe(KIT.replace(HH, `${HH}  s("oh").struct("~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n`))
    })

    it('lines the sounds up again when a longer name comes or goes', () => {
        const longer = change(KIT, (rows) => [...rows, row('perc', [1])])
        expect(longer).toContain('  s("bd")  .struct("x ~ ~ ~')
        expect(longer).toContain('  s("cp")  .struct("~ ~ ~ ~   x ~ ~ ~   ~ ~ ~ ~   x ~ ~ ~").hpf(slider(400, 20, 4000)).gain(0.6),\n')
        expect(longer).toContain('  s("perc").struct("~ x ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n)\n')
        expect(change(longer, (rows) => removeRow(rows, 'perc'))).toBe(KIT)
    })

    it('takes a sound out with its line and its controls', () => {
        expect(change(KIT, (rows) => removeRow(rows, 'cp'))).toBe(KIT.replace(CP, ''))
        expect(change(KIT, (rows) => removeRow(rows, 'bd'))).toBe(KIT.replace(BD, ''))
        expect(change(KIT, (rows) => removeRow(rows, 'hh'))).toBe(KIT.replace(HH, ''))
    })

    it('adds the first sound to a kit that has none, and removes the last', () => {
        const empty = 'drums: stack(\n)\n  .bank("RolandTR909")\n'
        const one = change(empty, () => [row('bd', [])])
        expect(one).toBe('drums: stack(\n  s("bd").struct("~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n)\n  .bank("RolandTR909")\n')
        expect(change(one, () => [])).toBe(empty)
        expect(plain(change('drums: stack()\n', () => [row('bd', [0])]))).toEqual([row('bd', [0])])
    })

    it('copes with a kit written on one line without a closing comma', () => {
        const code = 'drums: stack(s("bd").struct("x ~ ~ ~"), s("hh").struct("~ ~ x ~").gain(0.5))\n'
        expect(plain(change(code, (rows) => removeRow(rows, 'hh')))).toEqual([row('bd', [0], 4)])
        expect(plain(change(code, (rows) => removeRow(rows, 'bd')))).toEqual([row('hh', [2], 4)])
        const added = change(code, (rows) => [...rows, row('cp', [1], 4)])
        expect(plain(added)).toEqual([row('bd', [0], 4), row('hh', [2], 4), row('cp', [1], 4)])
        expect(added).toContain('.gain(0.5)')
    })

    it('makes every sound longer or shorter together', () => {
        const kit = readKit(first(KIT))!
        const longer = change(KIT, () => resize(kit, 2))
        expect(readKit(first(longer))!.rows.map((r) => hits(r.steps))).toEqual([[0, 4, 8, 12, 16, 20, 24, 28], [4, 12, 20, 28], []])
        expect(longer).toContain('.hpf(slider(400, 20, 4000)).gain(0.6),\n')
    })
})

describe('controls of one sound', () => {
    it('are added at the end of its own line', () => {
        const [bd] = readKit(first(KIT))!.rows
        const next = applyEdits(KIT, [addCall(KIT, bd.block, '.lpf(slider(800, 100, 8000))')])
        expect(next).toBe(KIT.replace(BD, '  s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~").lpf(slider(800, 100, 8000)),\n'))
        expect(favourites(readKit(first(next))!.rows[0].block).map((view) => view.fn)).toEqual(['lpf'])
    })

    it('are removed without touching the rest of the line', () => {
        const [, cp] = readKit(first(KIT))!.rows
        const next = applyEdits(KIT, [removeCall(cp.block.calls[2])])
        expect(next).toContain('  s("cp").struct("~ ~ ~ ~   x ~ ~ ~   ~ ~ ~ ~   x ~ ~ ~").gain(0.6),\n')
    })

    it('leave the controls of the whole kit where they are', () => {
        const next = applyEdits(KIT, [addCall(KIT, first(KIT), '.crush(slider(8, 1, 16))')])
        expect(next).toBe(`${KIT.trimEnd()}\n  .crush(slider(8, 1, 16))\n`)
    })
})

describe('muting one sound', () => {
    const MUTED = KIT.replace(CP, CP.replace('.gain(0.6),', '.gain(0.6).hush(),'))

    it('is read from a hush at the end of its line', () => {
        expect(readKit(first(KIT))!.rows.map((r) => r.muted)).toEqual([false, false, false])
        expect(readKit(first(MUTED))!.rows.map((r) => r.muted)).toEqual([false, true, false])
        expect(favourites(readKit(first(MUTED))!.rows[1].block).map((view) => view.fn)).toEqual(['hpf'])
    })

    it('is written after the controls the sound already has', () => {
        const [, cp] = readKit(first(KIT))!.rows
        expect(applyEdits(KIT, [addCall(KIT, cp.block, '.hush()')])).toBe(MUTED)
    })

    it('stays last when the sound is given another control', () => {
        const [, cp] = readKit(first(MUTED))!.rows
        expect(applyEdits(MUTED, [addCall(MUTED, cp.block, '.pan(slider(0.5, 0, 1))')])).toContain('.gain(0.6).pan(slider(0.5, 0, 1)).hush(),\n')
    })

    it('is taken away without touching the rest of the line', () => {
        const [, cp] = readKit(first(MUTED))!.rows
        const hush = cp.block.calls.find((call) => call.name === 'hush')!
        expect(applyEdits(MUTED, [removeCall(hush)])).toBe(KIT)
    })

    it('keeps its steps editable', () => {
        const next = change(MUTED, (rows) => toggleStep(rows, 'cp', 0, 16))
        expect(next).toContain('  s("cp").struct("x ~ ~ ~   x ~ ~ ~   ~ ~ ~ ~   x ~ ~ ~").hpf(slider(400, 20, 4000)).gain(0.6).hush(),\n')
    })
})

describe('convertEdits', () => {
    it('rewrites a grid written as one text into one line for each sound', () => {
        const code = 'drums: s(`\n  bd ~  ~  ~    bd ~  ~  ~    bd ~  ~  ~    bd ~  ~  ~ ,\n  ~  ~  ~  ~    cp ~  ~  ~    ~  ~  ~  ~    cp ~  ~  ~\n`)\n  .bank("RolandTR909")\n'
        const block = first(code)
        const source = readGrid(block)!
        expect(applyEdits(code, convertEdits(block, source.slow, source.grid.rows, 1))).toBe(
            'drums: stack(\n  s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~"),\n  s("cp").struct("~ ~ ~ ~   x ~ ~ ~   ~ ~ ~ ~   x ~ ~ ~"),\n)\n  .bank("RolandTR909")\n',
        )
    })

    it('rewrites a compact line, keeping what follows it', () => {
        const code = 'drums: s("bd*2, hh*4").bank("RolandTR909").room(0.2)\n'
        const rows = parseGrid('bd ~ bd ~, hh hh hh hh')!
        expect(applyEdits(code, convertEdits(first(code), null, rows, 1))).toBe(
            'drums: stack(\n  s("bd").struct("x ~ x ~"),\n  s("hh").struct("x x x x"),\n).bank("RolandTR909").room(0.2)\n',
        )
    })

    it('keeps, adds and removes slow with the length', () => {
        const code = 'drums: s(`\n  bd ~ ~ ~ ~ ~ ~ ~\n`).slow(2)\n'
        const block = first(code)
        const source = readGrid(block)!
        const same = applyEdits(code, convertEdits(block, source.slow, source.grid.rows, 2))
        expect(same).toBe('drums: stack(\n  s("bd").struct("x ~ ~ ~   ~ ~ ~ ~"),\n).slow(2)\n')
        const one = applyEdits(code, convertEdits(block, source.slow, resize(source.grid, 1), 1))
        expect(one).toBe('drums: stack(\n  s("bd").struct("x ~ ~ ~"),\n)\n')
        const plainCode = 'drums: s("bd ~ ~ ~")\n'
        const four = applyEdits(plainCode, convertEdits(first(plainCode), null, [row('bd', [0, 4], 8)], 2))
        expect(four).toBe('drums: stack(\n  s("bd").struct("x ~ ~ ~   x ~ ~ ~"),\n).slow(2)\n')
    })
})
