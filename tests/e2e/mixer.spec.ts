import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\nbass: note("c2 e2 g2 e2").s("sawtooth").lpf(900)\n'

const mixer = (page: Page) => page.getByTestId('mixer')
const knob = (page: Page, name: string) => mixer(page).getByRole('slider', { name, exact: true })
const mix = (page: Page) => page.evaluate(() => (window as any).__weft.engine.mix() as { volume: number; pan: number; low: number; mid: number; high: number; limit: boolean })
const levels = (page: Page) => page.evaluate(() => ((window as any).__weft.engine.levels() ?? [0, 0]) as [number, number])
const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)

async function open(page: Page) {
    await page.addInitScript((text) => {
        if (!sessionStorage.getItem('seeded')) {
            localStorage.setItem('weft.song', text)
            sessionStorage.setItem('seeded', '1')
        }
    }, SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await page.getByTestId('top').getByRole('button', { name: 'Mixer', exact: true }).click()
    await expect(mixer(page)).toBeVisible()
}

test('the mixer is shown from the top bar, by itself or under the sounds and the jam, and is remembered', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('sound-browser')).toHaveCount(0)
    await page.getByTestId('top').getByRole('button', { name: 'Sounds', exact: true }).click()
    await expect(page.getByTestId('sound-browser')).toBeVisible()
    await expect(mixer(page)).toBeVisible()
    await page.reload()
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(mixer(page)).toBeVisible()
    await mixer(page).getByRole('button', { name: 'Close mixer', exact: true }).click()
    await expect(mixer(page)).toHaveCount(0)
    await expect(page.getByTestId('top').getByRole('button', { name: 'Mixer', exact: true })).toHaveAttribute('aria-pressed', 'false')
})

test('volume, pan, tone and the limiter are set in the mixer, kept for next time and never written into the song', async ({ page }) => {
    await open(page)
    const before = await code(page)
    await expect(page.getByTestId('top').getByRole('slider')).toHaveCount(0)
    const volume = knob(page, 'Master volume')
    await expect(volume).toHaveAttribute('aria-valuetext', '100%')
    await volume.focus()
    await page.keyboard.press('PageDown')
    await expect(volume).toHaveAttribute('aria-valuetext', '85%')
    await expect(page.getByTestId('mixer-volume')).toHaveText('85%')

    await knob(page, 'Pan').focus()
    await page.keyboard.press('Home')
    await expect(knob(page, 'Pan')).toHaveAttribute('aria-valuetext', '100% left')
    await knob(page, 'Low').focus()
    await page.keyboard.press('PageUp')
    await expect(knob(page, 'Low')).toHaveAttribute('aria-valuetext', '+2.5 dB')
    await knob(page, 'Mid').focus()
    await page.keyboard.press('PageDown')
    await knob(page, 'High').focus()
    await page.keyboard.press('End')
    const limiter = mixer(page).getByRole('button', { name: 'Limiter', exact: true })
    await expect(limiter).toHaveAttribute('aria-pressed', 'false')
    await limiter.click()
    await expect(limiter).toHaveAttribute('aria-pressed', 'true')
    expect(await mix(page)).toEqual({ volume: 0.85, pan: -1, low: 2.5, mid: -2.5, high: 12, limit: true })
    expect(await code(page)).toBe(before)

    await page.reload()
    await page.waitForFunction(() => Boolean((window as any).__weft))
    expect(await mix(page)).toEqual({ volume: 0.85, pan: -1, low: 2.5, mid: -2.5, high: 12, limit: true })
    await expect(knob(page, 'Master volume')).toHaveAttribute('aria-valuetext', '85%')

    const reset = mixer(page).getByRole('button', { name: 'Reset', exact: true })
    await reset.click()
    expect(await mix(page)).toEqual({ volume: 1, pan: 0, low: 0, mid: 0, high: 0, limit: false })
    await expect(reset).toBeDisabled()
    await expect(knob(page, 'Pan')).toHaveAttribute('aria-valuetext', 'Centre')
})

test('the fader goes where it is pressed, and back to 100% on a double click', async ({ page }) => {
    await open(page)
    const volume = knob(page, 'Master volume')
    const box = (await volume.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 2)
    expect((await mix(page)).volume).toBeLessThan(0.05)
    await page.mouse.click(box.x + box.width / 2, box.y + 1)
    expect((await mix(page)).volume).toBeGreaterThan(1.45)
    await volume.dblclick()
    expect((await mix(page)).volume).toBe(1)
})

test('what the mixer does is heard: both sides sound, pan takes one away, and the volume at nothing silences both', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(async () => Math.min(...(await levels(page))), { timeout: 20000 }).toBeGreaterThan(0.02)

    await knob(page, 'Pan').focus()
    await page.keyboard.press('Home')
    await expect.poll(async () => (await levels(page))[1], { timeout: 10000 }).toBeLessThan(0.005)
    expect((await levels(page))[0]).toBeGreaterThan(0.02)
    await page.keyboard.press('End')
    await expect.poll(async () => (await levels(page))[0], { timeout: 10000 }).toBeLessThan(0.005)
    await expect.poll(async () => (await levels(page))[1], { timeout: 10000 }).toBeGreaterThan(0.02)

    await mixer(page).getByRole('button', { name: 'Reset', exact: true }).click()
    await knob(page, 'Master volume').focus()
    await page.keyboard.press('Home')
    await expect.poll(async () => Math.max(...(await levels(page))), { timeout: 10000 }).toBeLessThan(0.005)
})
