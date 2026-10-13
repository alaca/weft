import { expect, test, type Page } from '@playwright/test'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const patternText = async (page: Page, id: string) => (await code(page)).split('\n\n').find((part) => part.startsWith(`${id}:`) || part.startsWith(`_${id}:`)) ?? ''

test('a preset from the list becomes the sound of a pattern, and a sound is saved as a preset and used again', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready')

    await page.getByRole('button', { name: 'Change the sound of bass', exact: true }).click()
    await page.getByRole('radio', { name: 'Presets' }).click()
    await page.getByRole('button', { name: 'Hear Acid bass', exact: true }).click()
    await page.getByRole('button', { name: 'Use Acid bass for bass', exact: true }).click()
    // The notes stay, the old sound and its knobs go, the new ones are written.
    const bass = await patternText(page, 'bass')
    expect(bass).toContain('bass: note("d2 ~ d2 f2 ~ d2 a1 [c2 d2]")\n  .s("sawtooth")\n  .lpf(slider(500, 100, 8000))\n  .lpq(slider(18, 0, 30))')
    expect(bass).toContain('.distort(slider(0.6, 0, 5))')
    expect(bass).not.toContain('.lpenv(3)')

    // The sound of another pattern is kept under a name.
    await page.getByRole('button', { name: 'Sound controls for chords', exact: true }).click()
    await page.getByRole('button', { name: 'Save as preset', exact: true }).click()
    await page.getByRole('textbox', { name: 'Name of the preset' }).fill('Soft keys')
    await page.getByRole('button', { name: 'Save preset', exact: true }).click()
    await expect(page.getByTestId('preset-note')).toHaveText('Saved as Soft keys. It is under Presets in the Sounds panel.')

    // It is listed first, as yours, and becomes the sound of the bass in turn.
    await page.getByRole('button', { name: 'Change the sound of bass', exact: true }).click()
    await page.getByRole('radio', { name: 'Presets' }).click()
    await page.getByRole('button', { name: 'Use Soft keys for bass', exact: true }).click()
    expect(await patternText(page, 'bass')).toBe('bass: note("d2 ~ d2 f2 ~ d2 a1 [c2 d2]")\n  .s("gm_epiano1")\n  .room(slider(0.4, 0, 1))')

    // It is still there after the app is opened again, and can be taken off the list.
    await page.reload()
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready')
    await page.getByRole('button', { name: 'Change the sound of bass', exact: true }).click()
    await page.getByRole('radio', { name: 'Presets' }).click()
    await page.getByRole('button', { name: 'Remove Soft keys from your presets' }).click()
    await expect(page.getByRole('button', { name: 'Hear Soft keys', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Hear Acid bass', exact: true })).toBeVisible()
    expect(errors).toEqual([])
})
