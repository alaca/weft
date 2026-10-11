import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\nbass: note("c2 e2")\n  .s("sawtooth")\n  .lpf(slider(1200, 100, 8000))\n\nriff: note("c4")\n  .s("sawtooth")\n  .lpf(sine.range(500, 2600).slow(16))\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)

async function open(page: Page) {
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

test('a knob is set moving by itself, changed, and made to stand still again', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    await bass.getByRole('button', { name: 'Sound controls for bass', exact: true }).click()
    await bass.getByRole('slider', { name: 'Cutoff', exact: true }).hover()
    await bass.getByRole('button', { name: 'Let Cutoff move by itself', exact: true }).click()
    await expect.poll(() => code(page)).toContain('  .lpf(sine.range(375, 1200).slow(4))\n')
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')

    const moving = bass.getByRole('button', { name: 'Cutoff moves by itself', exact: true })
    await expect(bass.getByTestId('sound-panel')).toContainText('375 to 1200 Hz')
    await moving.click()
    const box = bass.getByRole('dialog', { name: 'How Cutoff moves' })
    await box.getByRole('button', { name: 'One way', exact: true }).click()
    await expect.poll(() => code(page)).toContain('.lpf(saw.range(375, 1200).slow(4))')
    await box.getByRole('button', { name: '8', exact: true }).click()
    await expect.poll(() => code(page)).toContain('.lpf(saw.range(375, 1200).slow(8))')
    await box.getByLabel('Moves from').fill('4000')
    await box.getByLabel('Moves from').press('Tab')
    await box.getByLabel('Moves to').fill('200')
    await box.getByLabel('Moves to').press('Tab')
    await expect.poll(() => code(page)).toContain('.lpf(saw.range(4000, 200).slow(8))')
    await box.getByRole('button', { name: '1', exact: true }).click()
    await expect.poll(() => code(page)).toContain('.lpf(saw.range(4000, 200))\n')

    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await page.getByRole('button', { name: 'Stop', exact: true }).click()

    await expect(box).toHaveCount(0)
    await moving.click()
    await box.getByRole('button', { name: 'Stand still again', exact: true }).click()
    await expect.poll(() => code(page)).toContain('  .lpf(slider(200, 100, 8000))\n')
    await expect(bass.getByRole('slider', { name: 'Cutoff', exact: true })).toHaveAttribute('aria-valuenow', '200')
})
