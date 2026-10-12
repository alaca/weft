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

// Drums that differ from bar to bar, over notes that are four bars long and go through an
// effect that sweeps by the clock, at a tempo whose bars do not end on a sample.
const LONG_NOTES = 'setcpm(146/4)\n\ndrums: s("<bd*2 bd*3>")\n  .bank("RolandTR909")\n\npad: note("<c3 e3>/4")\n  .s("triangle")\n  .phaser(0.7)\n'

test('a recording that starts at a later bar is the song from that bar on, with the note that began before it', async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), LONG_NOTES)
    await page.goto('/')
    await ready(page)
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    const heard = await page.evaluate(async () => {
        const { engine } = (window as any).__weft
        const whole = await engine.render({ bars: 32, ringSeconds: 0, sampleRate: 22050 })
        const late = await engine.render({ from: 31, bars: 32, ringSeconds: 0, sampleRate: 22050 })
        const cut = Math.round(31 * whole.secondsPerBar * whole.sampleRate)
        const there: Float32Array = whole.channels[0].subarray(cut)
        const here: Float32Array = late.channels[0]
        let apart = 0
        let sum = 0
        for (let at = 0; at < here.length; at++) {
            apart = Math.max(apart, Math.abs(here[at] - there[at]))
            sum += here[at] * here[at]
        }
        return { length: here.length, rest: there.length, apart, loud: Math.sqrt(sum / here.length) }
    })
    expect(heard.length).toBe(heard.rest)
    expect(heard.loud).toBeGreaterThan(0.05)
    expect(heard.apart).toBeLessThan(0.001)
})

// A clap with a large reverb in the first four bars only, and from the ninth bar on a clap
// that asks for reverb and names no size.
const EARLY_ROOM =
    'setcpm(120/4)\n\nbig: s("cp")\n  .bank("RolandTR909")\n  .room(0.9)\n  .roomsize(8)\n  .mask("<1!4 0!60>")\n\nsmall: s("cp")\n  .bank("RolandTR909")\n  .room(0.9)\n  .mask("<0!8 1!56>")\n'

test('a recording that starts at a later bar has the reverb the song has by then, from its first sound on', async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), EARLY_ROOM)
    await page.goto('/')
    await ready(page)
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    const rings = await page.evaluate(async () => {
        const { engine } = (window as any).__weft
        const whole = await engine.render({ bars: 18, ringSeconds: 0, sampleRate: 22050 })
        const late = await engine.render({ from: 16, bars: 18, ringSeconds: 0, sampleRate: 22050 })
        // From one second after a clap until the next clap nothing sounds but its reverb.
        const ring = (heard: Float32Array, clap: number) => {
            let sum = 0
            for (let at = Math.round((clap + 1) * 22050); at < Math.round((clap + 1.9) * 22050); at++) sum += heard[at] * heard[at]
            return Math.sqrt(sum / (0.9 * 22050))
        }
        return { song: ring(whole.channels[0], 16 * whole.secondsPerBar), late: ring(late.channels[0], 0) }
    })
    expect(rings.song).toBeGreaterThan(0.005)
    expect(rings.late).toBeGreaterThan(rings.song * 0.7)
    expect(rings.late).toBeLessThan(rings.song * 1.4)
})
