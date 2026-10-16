import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\nbass: note("c2 e2").s("sawtooth")\n  .room(0.4).delay(0.5)\n\nlead: note("c4").s("square")\n'

async function open(page: Page) {
    await page.addInitScript((value) => {
        if (!sessionStorage.getItem('seeded')) {
            localStorage.setItem('weft.song', value)
            sessionStorage.setItem('seeded', '1')
        }
    }, SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const line = (page: Page, text: string) => page.locator('.cm-line', { hasText: text }).first()

test('code that is selected is kept as a snippet, and put in again by typing its name', async ({ page }) => {
    await open(page)
    await line(page, '.room(0.4)').click()
    await page.keyboard.press('End')
    await page.keyboard.press('Shift+Home')
    await page.getByRole('button', { name: 'Snippets', exact: true }).click()
    const menu = page.getByRole('dialog', { name: 'Snippets' })
    await expect(menu).toContainText('.room(0.4).delay(0.5)')
    await menu.getByRole('textbox', { name: 'Name of the snippet' }).fill('Space')
    await menu.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(menu.getByRole('status')).toHaveText('Saved as space. Type space in the code to put it in.')
    await page.keyboard.press('Escape')

    await line(page, 'note("c4")').click()
    await page.keyboard.press('End')
    await page.keyboard.type('.spa')
    const offer = page.getByRole('option', { name: /space/ })
    await expect(offer).toBeVisible()
    // The editor takes no choice in the first moment the list is open.
    await page.waitForTimeout(150)
    await page.keyboard.press('Enter')
    await expect.poll(() => code(page)).toContain('lead: note("c4").s("square").room(0.4).delay(0.5)\n')

    // One the app comes with is put in where the cursor is, and yours are there after a restart.
    await page.reload()
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await line(page, 'setcpm').click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Snippets', exact: true }).click()
    await expect(page.getByTestId('snippets').getByRole('button', { name: 'Put in space', exact: true })).toBeVisible()
    await page.getByTestId('snippets').getByRole('button', { name: 'Put in fourfloor', exact: true }).click()
    await expect.poll(() => code(page)).toContain('setcpm(120/4)\nkick: s("bd*4").bank("RolandTR909")\n')
})
