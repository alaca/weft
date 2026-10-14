import { expect, test, type Page } from '@playwright/test'

// A song that plays nothing, so that what is heard is the metronome alone.
const SONG = 'setcpm(120/4)\n\nquiet: note("~")\n  .s("triangle")\n'

const heard = (page: Page) =>
    page.evaluate(() => {
        const wave = (window as any).__weft.engine.waveform() as Float32Array | null
        return wave ? Math.max(...Array.from(wave, Math.abs)) : 0
    })
// A click lasts a moment, so it is listened for often. Playwright uses the list of intervals
// up, so every wait is given one of its own.
const often = () => ({ intervals: [30], timeout: 8000 })

test('the metronome clicks while the song plays, and the count-in clicks one bar before the song starts', async ({ page }) => {
    await page.addInitScript((text) => localStorage.setItem('weft.song', text), SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    const metronome = page.getByRole('button', { name: 'Metronome', exact: true })
    const countIn = page.getByRole('menuitemcheckbox', { name: 'Count in one bar' })

    // A song with nothing in it is silent, until the metronome is switched on.
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await page.waitForTimeout(1200)
    expect(await heard(page)).toBeLessThan(0.001)
    await metronome.click()
    await expect(metronome).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => heard(page), often()).toBeGreaterThan(0.01)
    await metronome.click()
    await page.waitForTimeout(300)
    await expect.poll(() => heard(page), often()).toBeLessThan(0.001)
    await page.getByRole('button', { name: 'Stop', exact: true }).click()

    // Counted in, the song stands at its first bar for a bar of clicks, then plays on in silence.
    await page.getByRole('button', { name: 'Count-in', exact: true }).click()
    await countIn.click()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('cycle-cap')).toHaveText('Count')
    await expect(page.getByTestId('cycle')).toHaveText('1')
    await expect.poll(() => heard(page), often()).toBeGreaterThan(0.01)
    await expect(page.getByTestId('cycle-cap')).toHaveText('Cycle', { timeout: 4000 })
    await page.waitForTimeout(300)
    await expect.poll(() => heard(page), often()).toBeLessThan(0.001)
    await page.getByRole('button', { name: 'Stop', exact: true }).click()

    // Both are kept as they were switched.
    await page.reload()
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(metronome).toHaveAttribute('aria-pressed', 'false')
    await page.getByRole('button', { name: 'Count-in', exact: true }).click()
    await expect(countIn).toHaveAttribute('aria-checked', 'true')
})
