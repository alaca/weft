import { expect, test, type Page } from '@playwright/test'

const SONG = `setcpm(120/4)

drums: s("bd*4, hh*8")
  .bank("RolandTR909")
  .degradeBy(slider(0.2, 0, 1))

bass: note("d2 ~ d2 f2")
  .s("sawtooth")
  .lpf(slider(1200, 200, 4000))
  .lpq(8)
  .pan(sine.slow(4))
`

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)

async function open(page: Page, song = SONG) {
    await page.addInitScript((text) => localStorage.setItem('weft.song', text), song)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

test('turning a slider knob rewrites its number and the code stays in step', async ({ page }) => {
    await open(page)
    const cutoff = page.getByTestId('strip-bass').getByRole('slider', { name: 'Cutoff' })
    await cutoff.focus()
    await page.keyboard.press('ArrowUp')
    await expect.poll(() => code(page)).toContain('slider(1238, 200, 4000)')
    await expect(cutoff).toHaveAttribute('aria-valuenow', '1238')
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
    const inline = page.locator('.cm-line', { hasText: '.lpf(' }).locator('.cm-slider input')
    await expect.poll(async () => Math.abs(Number(await inline.inputValue()) - 1238)).toBeLessThan(4)
})

test('pressing a faint knob adds its line, and removing it takes the line away', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    await bass.getByRole('button', { name: 'Sound controls for bass' }).click()
    await bass.getByRole('button', { name: 'Add Delay' }).click()
    await expect.poll(() => code(page)).toContain('  .pan(sine.slow(4))\n  .delay(slider(0.25, 0, 1))\n')
    await expect(bass).toContainText('lines 7 to 12')
    const delay = bass.getByRole('slider', { name: 'Delay' })
    await expect(delay).toHaveAttribute('aria-valuenow', '0.25')

    await delay.hover()
    await bass.getByRole('button', { name: 'Remove Delay' }).click()
    await expect.poll(() => code(page)).not.toContain('.delay(')
    await expect(bass.getByRole('button', { name: 'Add Delay' })).toBeVisible()
})

test('every strip has a volume knob that writes gain into the code when it is first turned', async ({ page }) => {
    await open(page)
    const volume = page.getByTestId('strip-drums').getByRole('slider', { name: 'Volume of drums', exact: true })
    await expect(volume).toHaveAttribute('aria-valuenow', '0.8')
    await expect.poll(() => code(page)).not.toContain('.gain(')
    await volume.focus()
    await page.keyboard.press('End')
    await expect.poll(() => code(page)).toContain('.gain(slider(1.5, 0, 1.5))')
    await expect(volume).toBeFocused()
    await page.keyboard.press('PageDown')
    await expect.poll(() => code(page)).toContain('.gain(slider(1.35, 0, 1.5))')
    await expect(volume).toHaveAttribute('aria-valuenow', '1.35')
})
