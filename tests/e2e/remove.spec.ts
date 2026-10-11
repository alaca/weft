import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n\nbass: note("c2 e2")\n  .s("sawtooth")\n\nlead: note("c4 e4")\n'
const NO_BASS = 'setcpm(120/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n\nlead: note("c4 e4")\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const events = (page: Page, id: string) => page.evaluate((name) => (window as any).__weft.engine.events(name, 0).length as number, id)
const remove = (page: Page, id: string) => page.getByRole('button', { name: `Remove the pattern ${id}`, exact: true })
const names = (page: Page) => page.locator('.st .st-n')

async function open(page: Page, song = SONG) {
    await page.addInitScript((text) => localStorage.setItem('weft.song', text), song)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

test('takes a pattern out of the song and the code', async ({ page }) => {
    await open(page)
    await expect.poll(() => events(page, 'bass')).toBe(2)
    await remove(page, 'bass').click()
    await expect.poll(() => code(page)).toBe(NO_BASS)
    await expect(names(page)).toHaveText(['drums', 'lead'])
    await expect.poll(() => events(page, 'bass')).toBe(0)
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
})

test('says what was removed where it was, and puts it back', async ({ page }) => {
    await open(page)
    await remove(page, 'bass').click()
    const gone = page.getByTestId('removed')
    await expect(gone).toHaveText(/bass was removed\./)
    await expect(page.locator('.ctl > .st, .ctl > .gone')).toHaveText([/drums/, /bass was removed/, /lead/])
    await gone.getByRole('button', { name: 'Put it back' }).click()
    await expect.poll(() => code(page)).toBe(SONG)
    await expect(names(page)).toHaveText(['drums', 'bass', 'lead'])
    await expect(page.getByTestId('strip-bass')).toHaveClass(/sel/)
    await expect(gone).toHaveCount(0)
    await expect.poll(() => events(page, 'bass')).toBe(2)
})
