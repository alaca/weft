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

test('a pattern gets a second version that is changed by itself, chosen for bars in the Song panel, and plays there', async ({ page }) => {
    await open(page)
    const strip = page.getByTestId('strip-drums')
    const events = (bar: number) => page.evaluate((at) => (window as any).__weft.engine.events('drums', at).length as number, bar)
    await page.getByRole('group', { name: 'What plays' }).getByRole('button', { name: 'Song', exact: true }).click()
    await more(page, 'drums', 'Add a version')
    await expect.poll(() => code(page)).toContain('drums: "<0!16>".pick([\n  stack(')
    const versions = strip.getByRole('group', { name: 'Versions of drums' })
    await expect(versions.getByRole('button', { name: 'Version B of drums', exact: true })).toHaveAttribute('aria-pressed', 'true')

    // What is clicked into the one in sight goes into that one alone.
    await strip.getByRole('button', { name: 'bd step 9', exact: true }).click()
    await expect.poll(() => code(page)).toContain('  s("bd").struct("x ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n),\n  stack(\n  s("bd").struct("x ~ ~ ~   ~ ~ ~ ~   x ~ ~ ~   ~ ~ ~ ~"),\n),\n])\n  .bank("RolandTR909")')
    await versions.getByRole('button', { name: 'Version A of drums', exact: true }).click()
    await expect(strip.getByRole('button', { name: 'bd step 9', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await versions.getByRole('button', { name: 'Version B of drums', exact: true }).click()
    await expect(strip.getByRole('button', { name: 'bd step 9', exact: true })).toHaveAttribute('aria-pressed', 'true')

    // A bar that is filled while B is in sight takes B, and plays what B plays.
    const bar = (await page.getByTestId('lane-drums').getByRole('button', { name: 'drums bar 3', exact: true }).boundingBox())!
    await page.mouse.click(bar.x + bar.width / 2, bar.y + bar.height / 2)
    await expect.poll(() => code(page)).toContain('drums: "<0!2 1 0!13>".pick([')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    expect(await events(0)).toBe(1)
    expect(await events(2)).toBe(2)

    // Taken away again, the pattern is written the plain way, with what the first one plays.
    await more(page, 'drums', 'Remove version B')
    await expect.poll(() => code(page)).toBe(SONG)
    await expect(versions).toHaveCount(0)
})

