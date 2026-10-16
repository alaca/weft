import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\nkeys: note("c3 e3 g3 c4 e4 g4 c5 g4").s("pluck")\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const rendered = (page: Page) =>
    page.evaluate(async () => {
        const done = await (window as any).__weft.engine.render({ bars: 2, ringSeconds: 0, sampleRate: 22050 })
        return Array.from(done.channels[0] as Float32Array)
    })
const peak = (wave: number[]) => wave.reduce((most, x) => Math.max(most, Math.abs(x)), 0)

// A plugin sound plays and goes into a file, its own knobs are in its sound controls, and a
// plugin effect goes on the pattern and changes what is heard.
test('a Faust plugin plays as a sound with knobs of its own, and a plugin effect goes on a pattern', async ({ page }) => {
    await page.addInitScript((value) => {
        if (!sessionStorage.getItem('seeded')) {
            localStorage.setItem('weft.song', value)
            sessionStorage.setItem('seeded', '1')
        }
    }, SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    const dry = await rendered(page)
    expect(peak(dry)).toBeGreaterThan(0.02)
    expect(peak(dry)).toBeLessThan(1)

    await page.getByRole('button', { name: 'Sound controls for keys' }).click()
    const panel = page.getByTestId('sound-panel')
    await panel.getByRole('button', { name: 'Add Damping', exact: true }).click()
    await expect.poll(() => code(page)).toContain('.damp(slider(0.3, 0, 1))')
    await expect(panel.getByRole('button', { name: 'Add Brightness', exact: true })).toBeVisible()

    await panel.getByLabel('Plugin effect of keys').selectOption('wah')
    await expect.poll(() => code(page)).toContain('.fx("wah")')
    await expect(panel.getByRole('button', { name: 'Add Wah speed', exact: true })).toBeVisible()
    const wet = await rendered(page)
    expect(peak(wet)).toBeGreaterThan(0.02)
    const apart = wet.reduce((sum, x, at) => sum + Math.abs(x - (dry[at] ?? 0)), 0) / wet.length
    expect(apart).toBeGreaterThan(0.001)

    await panel.getByLabel('Plugin effect of keys').selectOption('')
    await expect.poll(() => code(page)).not.toContain('.fx(')
})
