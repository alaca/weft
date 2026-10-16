import { expect, test, type Page } from '@playwright/test'

const MESSY = 'setcpm(120/4)\nbass: note("c2 ~ c2 eb2").s("sawtooth").lpf(600)\nlead: note("c4 e4").s("triangle")\n'
const LAID = 'setcpm(120/4)\n\nbass: note("c2 ~ c2 eb2")\n  .s("sawtooth")\n  .lpf(600)\n\nlead: note("c4 e4")\n  .s("triangle")\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)

test('the code is laid out when asked, undone in one step, and on every update when that is chosen', async ({ page }) => {
    await page.addInitScript((value) => {
        if (!sessionStorage.getItem('seeded')) {
            localStorage.setItem('weft.song', value)
            sessionStorage.setItem('seeded', '1')
        }
    }, MESSY)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))

    await page.getByRole('button', { name: 'Options for updating', exact: true }).click()
    await page.getByRole('menuitem', { name: /Format the code/ }).click()
    await expect.poll(() => code(page)).toBe(LAID)
    await expect(page.getByTestId('code-status')).toHaveText('Laid out')
    await page.locator('.cm-content').click()
    await page.keyboard.press('Meta+z')
    await expect.poll(() => code(page)).toBe(MESSY)

    // The keys do the same.
    await page.keyboard.press('Alt+Shift+f')
    await expect.poll(() => code(page)).toBe(LAID)

    // Chosen, an update lays the code out first, and the choice is kept.
    await page.getByRole('button', { name: 'Options for updating', exact: true }).click()
    await page.getByRole('menuitemcheckbox', { name: 'Format on every update' }).click()
    await page.getByRole('button', { name: 'Options for updating', exact: true }).click()
    await page.locator('.cm-line', { hasText: '.s("triangle")' }).click()
    await page.keyboard.press('End')
    await page.keyboard.type('.room(0.3).delay(0.2)')
    await page.keyboard.press('Meta+Enter')
    await expect.poll(() => code(page)).toBe(`${LAID.trimEnd()}\n  .room(0.3)\n  .delay(0.2)\n`)
    await page.reload()
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await page.getByRole('button', { name: 'Options for updating', exact: true }).click()
    await expect(page.getByRole('menuitemcheckbox', { name: 'Format on every update' })).toHaveAttribute('aria-checked', 'true')
})
