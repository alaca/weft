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

test('the tempo goes up and down by the arrows beside it, is halved and doubled, and is tapped in time', async ({ page }) => {
    await page.addInitScript((text) => localStorage.setItem('weft.song', text), SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    const tempo = page.getByTestId('tempo')
    const code = () => page.evaluate(() => (window as any).__weft.engine.getCode() as string)

    await page.getByRole('button', { name: 'Faster', exact: true }).click()
    await expect(tempo).toHaveValue('121')
    await page.getByRole('button', { name: 'Slower', exact: true }).click({ modifiers: ['Shift'] })
    await expect(tempo).toHaveValue('111')
    await expect.poll(code).toContain('setcpm(111/4)')

    const menu = page.getByRole('button', { name: 'Tempo settings', exact: true })
    await menu.click()
    await page.getByRole('menuitem', { name: /^Double the tempo/ }).click()
    await expect(tempo).toHaveValue('222')
    await page.getByRole('menuitem', { name: /^Half the tempo/ }).click()
    await expect(tempo).toHaveValue('111')

    const tap = page.getByRole('menuitem', { name: /^Tap tempo/ })
    for (let at = 0; at < 5; at++) {
        await tap.click()
        await page.waitForTimeout(400)
    }
    // Taps a little over 400 ms apart, as near as a test can press them, are about 140.
    const tapped = Number(await page.getByTestId('tapped').textContent())
    expect(tapped).toBeGreaterThan(115)
    expect(tapped).toBeLessThan(150)
    await expect(tempo).toHaveValue(String(tapped))
    await expect.poll(code).toContain(`setcpm(${tapped}/4)`)
})
