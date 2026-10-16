import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\nhats: stack(\n  s("hh").struct("x x x x   x x x x   x x x x   x x x x"),\n)\n  .bank("RolandTR909")\n\nbass: note("c2 e2")\n  .s("sawtooth")\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const starts = (page: Page, id: string) => page.evaluate((name) => ((window as any).__weft.engine.events(name, 0) as { start: number }[]).map((event) => Math.round(event.start * 1600) / 100), id)

async function open(page: Page) {
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

test('swing plays every second sixteenth late', async ({ page }) => {
    await open(page)
    const hats = page.getByTestId('strip-hats')
    await hats.getByRole('button', { name: 'Sound controls for hats', exact: true }).click()
    await expect(hats.locator('.sp h4').last()).toHaveText('Feel')
    expect((await starts(page, 'hats')).slice(0, 4)).toEqual([0, 1, 2, 3])
    await hats.getByRole('button', { name: 'Add Swing', exact: true }).click()
    await expect.poll(() => code(page)).toContain('  .bank("RolandTR909")\n  .swingBy(slider(0.2, 0, 0.5), 8)\n')
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
    await expect.poll(async () => (await starts(page, 'hats')).slice(0, 4)).toEqual([0, 1.2, 2, 3.2])

    const swing = hats.getByRole('slider', { name: 'Swing', exact: true })
    await swing.focus()
    await page.keyboard.press('End')
    await expect.poll(() => code(page)).toContain('.swingBy(slider(0.5, 0, 0.5), 8)')
    await expect.poll(async () => (await starts(page, 'hats')).slice(0, 4)).toEqual([0, 1.5, 2, 3.5])
})

// When the first sound of a recording of the song begins, in seconds.
const firstSound = (page: Page) =>
    page.evaluate(async () => {
        const made = await (window as any).__weft.engine.render({ bars: 1, ringSeconds: 0, sampleRate: 22050 })
        const at = (made.channels[0] as Float32Array).findIndex((value) => Math.abs(value) > 0.001)
        return Math.round((at / made.sampleRate) * 100) / 100
    })

test('loose timing lets a synth come late as it does a drum', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('weft.song', 'setcpm(60/4)\n\nbass: note("c3").s("sawtooth")\n'))
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    expect(await firstSound(page)).toBe(0)
    await page.evaluate(() => (window as any).__weft.engine.setCode('setcpm(60/4)\n\nbass: note("c3").s("sawtooth").nudge(0.1)\n'))
    await expect.poll(() => firstSound(page)).toBe(0.1)
})
