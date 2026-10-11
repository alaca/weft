import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\ndrums: stack(\n  s("bd").struct("x ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n)\n  .bank("RolandTR909")\n\nbass: note(`\n  c2 ~  ~  ~\n`)\n  .s("sawtooth")\n\nlead: note("c4 e4")\n  .s("triangle")\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const names = (page: Page) => page.locator('.st .st-n')
const more = (page: Page, id: string, item: string) =>
    page
        .getByTestId(`strip-${id}`)
        .getByRole('button', { name: `More for ${id}`, exact: true })
        .click()
        .then(() => page.getByTestId(`strip-${id}`).getByRole('menuitem', { name: item, exact: true }).click())

async function open(page: Page) {
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

test('a pattern is renamed from its menu or by a double click on its name', async ({ page }) => {
    await open(page)
    await more(page, 'bass', 'Rename')
    const field = page.getByLabel('New name for bass')
    await expect(field).toBeFocused()
    await field.fill('low end')
    await field.press('Enter')
    await expect(names(page)).toHaveText(['drums', 'low_end', 'lead'])
    expect(await code(page)).toContain('\n\nlow_end: note(`\n  c2 ~  ~  ~\n`)\n')
    await expect(page.getByTestId('lane-low_end')).toBeVisible()
    await expect(page.getByTestId('strip-low_end').locator('.nr-g')).toHaveCount(1)

    await page.getByTestId('strip-lead').locator('.st-n').dblclick()
    await page.getByLabel('New name for lead').fill('drums')
    await page.getByLabel('New name for lead').press('Enter')
    await expect(page.getByLabel('New name for lead')).toHaveAttribute('aria-invalid', 'true')
    await page.getByLabel('New name for lead').press('Escape')
    await expect(names(page)).toHaveText(['drums', 'low_end', 'lead'])
})

test('a pattern is duplicated straight after itself and can then be changed on its own', async ({ page }) => {
    await open(page)
    await more(page, 'drums', 'Duplicate')
    await expect(names(page)).toHaveText(['drums', 'drums2', 'bass', 'lead'])
    await page.getByTestId('strip-drums2').getByRole('button', { name: 'bd step 5', exact: true }).click()
    await expect.poll(() => code(page)).toContain('drums2: stack(\n  s("bd").struct("x ~ ~ ~   x ~ ~ ~')
    expect(await code(page)).toContain('drums: stack(\n  s("bd").struct("x ~ ~ ~   ~ ~ ~ ~')
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
})

test('a pattern is moved up and down, in the strips, the playlist and the code', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('strip-drums').getByRole('button', { name: 'More for drums', exact: true })).toBeVisible()
    await more(page, 'lead', 'Move up')
    await expect(names(page)).toHaveText(['drums', 'lead', 'bass'])
    await more(page, 'drums', 'Move down')
    await expect(names(page)).toHaveText(['lead', 'drums', 'bass'])
    await expect(page.locator('.sg-n span')).toHaveText(['lead', 'drums', 'bass'])
    expect((await code(page)).indexOf('lead:')).toBeLessThan((await code(page)).indexOf('drums:'))
    await page.getByTestId('strip-lead').getByRole('button', { name: 'More for lead', exact: true }).click()
    await expect(page.getByTestId('strip-lead').getByRole('menuitem', { name: 'Move up', exact: true })).toBeDisabled()
    await page.getByTestId('status').click()
    await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+z`)
    await expect(names(page)).toHaveText(['drums', 'lead', 'bass'])
})
