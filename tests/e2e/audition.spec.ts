import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\ndrums: s("bd ~ ~ ~")\n  .bank("RolandTR909")\n'

async function open(page: Page) {
    await page.addInitScript((text) => localStorage.setItem('weft.song', text), SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    const sounds = page.getByTestId('sounds')
    await expect(sounds).not.toHaveText('Loading sounds', { timeout: 60_000 })
    test.skip((await sounds.textContent()) !== 'Sounds ready', 'the sample packs could not be loaded, so there is nothing to hear')
}

const loudest = (page: Page) =>
    page.evaluate(() => {
        const data: Float32Array | null = (window as any).__weft.engine.waveform()
        let max = 0
        if (data) for (const value of data) max = Math.max(max, Math.abs(value))
        return max
    })

const heard = (page: Page) => expect.poll(() => loudest(page), { timeout: 8000, intervals: [20] }).toBeGreaterThan(0.05)

test('a sound is heard the moment it is added, even though its sample was never loaded', async ({ page }) => {
    await open(page)
    const drums = page.getByTestId('strip-drums')
    await drums.getByRole('button', { name: 'Add a sound' }).click()
    await drums.getByRole('menuitem', { name: /Crash/ }).click()
    await heard(page)
})
