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

test('loose timing and loose volume are knobs that turn a slider inside the call', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    await bass.getByRole('button', { name: 'Sound controls for bass', exact: true }).click()
    await bass.getByRole('button', { name: 'Add Loose timing', exact: true }).click()
    await bass.getByRole('button', { name: 'Add Loose volume', exact: true }).click()
    await expect.poll(() => code(page)).toContain('  .s("sawtooth")\n  .nudge(rand.range(0, slider(0.012, 0, 0.05)))\n  .velocity(rand.range(slider(0.75, 0.3, 1), 1))\n')
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')

    const timing = bass.getByRole('slider', { name: 'Loose timing', exact: true })
    await expect(timing).toHaveAttribute('aria-valuenow', '0.012')
    await timing.focus()
    await page.keyboard.press('End')
    await expect.poll(() => code(page)).toContain('.nudge(rand.range(0, slider(0.05, 0, 0.05)))')

    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect.poll(() => page.evaluate(() => (window as any).__weft.engine.now() as number)).toBeGreaterThan(0.4)
    await page.getByRole('button', { name: 'Stop', exact: true }).click()

    await timing.hover()
    await bass.getByRole('button', { name: 'Remove Loose timing', exact: true }).click()
    await expect.poll(() => code(page)).not.toContain('.nudge(')
})
