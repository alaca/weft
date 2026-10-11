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
