import { expect, test, type Page } from '@playwright/test'

const ready = (page: Page) => page.waitForFunction(() => Boolean((window as any).__weft))

test('keeps the events of each named pattern apart', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    const counts = await page.evaluate(() => {
        const { engine } = (window as any).__weft
        return {
            drums: engine.events('drums', 0).length,
            bass: engine.events('bass', 0).length,
            lead: engine.events('lead', 0).length,
            missing: engine.events('nobody', 0).length,
        }
    })
    expect(counts.drums).toBeGreaterThan(0)
    expect(counts.bass).toBe(7)
    expect(counts.lead).toBe(5)
    expect(counts.missing).toBe(0)
})

test('gives drums sounds and bass pitches', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    const shapes = await page.evaluate(() => {
        const { engine } = (window as any).__weft
        return {
            drumSounds: [...new Set(engine.events('drums', 0).map((e: any) => e.sound))].sort(),
            bassMidi: engine
                .events('bass', 0)
                .sort((a: any, b: any) => a.start - b.start)
                .map((e: any) => e.midi),
        }
    })
    expect((shapes.drumSounds as string[]).every((s) => ['bd', 'cp', 'hh'].includes(s))).toBe(true)
    expect(shapes.bassMidi).toEqual([38, 38, 41, 38, 33, 36, 38])
})

test('reads the tempo the code sets', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    expect(await page.evaluate(() => Math.round((window as any).__weft.engine.bpm()))).toBe(124)
})

test('leaves a muted pattern out of what plays, and solo leaves out the rest', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    const sounds = () =>
        page.evaluate(() => [...new Set((window as any).__weft.engine.audible(0).map((e: any) => e.sound))].sort())
    expect(await sounds()).not.toContain('triangle')
    expect(await sounds()).toContain('sawtooth')

    await page.evaluate(async () => {
        const { engine } = (window as any).__weft
        engine.setSolo(['bass'])
        await engine.evaluate()
        engine.stop()
    })
    expect(await sounds()).toEqual(['sawtooth'])
})

test('reports an error with its line and keeps the last good patterns', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    const result = await page.evaluate(async () => {
        const { engine } = (window as any).__weft
        let state: any = null
        engine.onState((s: any) => (state = s))
        engine.applyEdit({ from: 0, to: 0, insert: 'broken: s("bd"\n' })
        await engine.evaluate()
        engine.stop()
        return { error: state?.error, bass: engine.events('bass', 0).length }
    })
    expect(result.error.line).toBeGreaterThan(0)
    expect(result.error.message).toMatch(/Unexpected/)
    expect(result.bass).toBe(7)
})

test('applies several edits at once', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    const text = await page.evaluate(() => {
        const { engine } = (window as any).__weft
        const code: string = engine.getCode()
        const a = code.indexOf('lpf')
        const b = code.indexOf('lpq')
        engine.applyEdit([
            { from: a, to: a + 3, insert: 'hpf' },
            { from: b, to: b + 3, insert: 'hpq' },
        ])
        return engine.getCode() as string
    })
    expect(text).toContain('.hpf(slider(1200, 200, 4000))')
    expect(text).toContain('.hpq(slider(14, 0, 30))')
})

test('keeps a master volume and gives waveform data while playing', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    const volume = await page.evaluate(() => {
        const { engine } = (window as any).__weft
        engine.setMix({ ...engine.mix(), volume: 0.4 })
        return engine.mix().volume as number
    })
    expect(volume).toBeCloseTo(0.4)
    await page.getByRole('button', { name: 'Play' }).click()
    await expect.poll(() => page.evaluate(() => (window as any).__weft.engine.waveform()?.length ?? 0), { timeout: 20_000 }).toBeGreaterThan(0)
})

test('gives the events of a piece of mini-notation, cycle by cycle', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    const cycles = await page.evaluate(() => (window as any).__weft.engine.miniEvents('bd*4, [~ cp]*2', 2))
    expect(cycles).toHaveLength(2)
    expect(cycles[0].filter((e: any) => e.value === 'bd').map((e: any) => e.start)).toEqual([0, 0.25, 0.5, 0.75])
    expect(cycles[0].filter((e: any) => e.value === 'cp').map((e: any) => e.start)).toEqual([0.25, 0.75])
    expect(cycles[1]).toEqual(cycles[0])
    expect(await page.evaluate(() => (window as any).__weft.engine.miniEvents('bd [', 1))).toBeNull()
})
