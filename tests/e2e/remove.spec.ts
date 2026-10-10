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

test('stops offering to put it back once the song has changed', async ({ page }) => {
    await open(page)
    await remove(page, 'bass').click()
    await expect(page.getByTestId('removed')).toBeVisible()
    await page.getByRole('button', { name: 'Mute lead', exact: true }).click()
    await expect(page.getByTestId('removed')).toHaveCount(0)
    await expect.poll(() => code(page)).toContain('_lead: note("c4 e4")')
})

test('offers only the pattern removed last', async ({ page }) => {
    await open(page)
    await remove(page, 'bass').click()
    await remove(page, 'drums').click()
    await expect(page.getByTestId('removed')).toHaveCount(1)
    await expect(page.getByTestId('removed')).toHaveText(/drums was removed\./)
    await page.getByTestId('removed').getByRole('button', { name: 'Put it back' }).click()
    await expect.poll(() => code(page)).toBe(NO_BASS)
})

test('removing the last pattern leaves a song that can be started again', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await open(page, 'drums: s("bd*4")\n')
    await remove(page, 'drums').click()
    await expect.poll(() => code(page)).toBe('')
    await expect(page.getByTestId('controls')).toContainText('You can also add one below')
    await expect(page.getByTestId('removed')).toHaveText(/drums was removed\./)
    await page.getByTestId('add-pattern').getByRole('button', { name: 'Melody', exact: true }).click()
    await expect(names(page)).toHaveText(['melody'])
    expect(errors).toEqual([])
})

test('unfolds the other strips when the pattern with the open sound panel is removed', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Sound controls for bass', exact: true }).click()
    await expect(page.getByTestId('strip-drums').locator('.st-b')).toHaveCount(0)
    await remove(page, 'bass').click()
    await expect(page.getByTestId('strip-drums').locator('.st-b')).toHaveCount(1)
})

test('puts a drum kit back with every sound and control it had', async ({ page }) => {
    await open(page)
    const drums = page.getByTestId('strip-drums')
    await drums.getByRole('button', { name: 'Add a sound' }).click()
    await drums.getByRole('menuitem', { name: /Open hat/ }).click()
    await drums.getByRole('slider', { name: 'Volume of oh', exact: true }).focus()
    await page.keyboard.press('End')
    await expect.poll(() => code(page)).toContain('.gain(slider(1.5, 0, 1.5)),\n)')
    const before = await code(page)
    await remove(page, 'drums').click()
    await expect.poll(() => code(page)).not.toContain('drums')
    await page.getByTestId('removed').getByRole('button', { name: 'Put it back' }).click()
    await expect.poll(() => code(page)).toBe(before)
    await expect(page.getByTestId('strip-drums').locator('.rn')).toHaveText(['bd', 'oh'])
})

test('removes nothing while the code has an error', async ({ page }) => {
    await open(page)
    await page.evaluate(() => (window as any).__weft.engine.applyEdit({ from: 0, to: 0, insert: 'broken: s("bd"\n' }))
    await expect(remove(page, 'bass')).toBeDisabled()
})

test('a muted pattern can be removed too', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Mute bass', exact: true }).click()
    await remove(page, 'bass').click()
    await expect.poll(() => code(page)).toBe(NO_BASS)
})
