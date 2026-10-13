import { expect, test, type Page } from '@playwright/test'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)

test('a song is put in three quarters: its tempo stays, its bars get shorter, and a new pattern has the steps of such a bar', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.addInitScript(() => localStorage.setItem('weft.song', 'setcpm(120/4)\n'))
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready')
    await expect(page.locator('.beats i')).toHaveCount(4)

    await page.getByTestId('meter').selectOption('3/4')
    expect(await code(page)).toBe('setcpm(120/3)\n// time 3/4\n')
    await expect(page.getByTestId('tempo')).toHaveValue('120')
    await expect(page.locator('.beats i')).toHaveCount(3)

    // Drums that are added have twelve sixteenths, in three beats of four.
    await page.getByTestId('add-pattern').getByRole('button', { name: 'Drums', exact: true }).click()
    const drums = page.getByTestId('strip-drums')
    await expect(drums.locator('.prow').first().locator('.pad')).toHaveCount(12)
    await expect(drums.locator('.prow').first().locator('.grp')).toHaveCount(3)
    expect(await code(page)).toContain('s("bd").struct("~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~")')
    await expect(drums.getByRole('button', { name: '12 steps a cycle', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await drums.getByRole('button', { name: 'bd step 1', exact: true }).click()
    await drums.getByRole('button', { name: 'hh step 5', exact: true }).click()
    expect(await code(page)).toContain('s("bd").struct("x ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~")')

    // A bar of three quarter notes at 120 lasts a second and a half, and that is how it plays.
    await page.getByRole('button', { name: 'Live', exact: true }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    expect(await page.evaluate(() => (window as any).__weft.engine.barSeconds())).toBeCloseTo(1.5, 5)
    expect(await page.evaluate(() => Math.round((window as any).__weft.engine.bpm()))).toBe(120)
    await expect.poll(async () => Number(await page.getByTestId('cycle').textContent()), { timeout: 20_000 }).toBeGreaterThanOrEqual(3)
    await page.getByRole('button', { name: 'Stop', exact: true }).click()

    // The tempo is still set in quarter notes, and four quarters need no line of their own.
    await page.getByTestId('tempo').fill('90')
    await page.getByTestId('tempo').press('Enter')
    expect(await code(page)).toContain('setcpm(90/3)\n// time 3/4\n')
    await page.getByTestId('meter').selectOption('4/4')
    expect(await code(page)).toContain('setcpm(90/4)\n\ndrums:')
    await expect(page.locator('.beats i')).toHaveCount(4)
    expect(errors).toEqual([])
})
