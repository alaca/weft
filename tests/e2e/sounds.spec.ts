import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n\nbass: note("c2 e2")\n  .s("sawtooth")\n\nlead: note("c4 e4")\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const browser = (page: Page) => page.getByTestId('sound-browser')
const kind = (page: Page, name: string | RegExp) => browser(page).getByRole('radio', { name })
const openFor = (page: Page, id: string) => page.getByRole('button', { name: `Change the sound of ${id}`, exact: true }).click()

async function open(page: Page) {
    await page.addInitScript((text) => localStorage.setItem('weft.song', text), SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    const sounds = page.getByTestId('sounds')
    await expect(sounds).not.toHaveText('Loading sounds', { timeout: 60_000 })
    test.skip((await sounds.textContent()) !== 'Sounds ready', 'the sample packs could not be loaded, so there is nothing to browse')
}

test('opens for a pattern from its sound name, on the kind of sound it takes', async ({ page }) => {
    await open(page)
    await expect(page.getByRole('button', { name: 'Change the sound of lead', exact: true })).toHaveText('Pick a sound')
    await openFor(page, 'bass')
    await expect(page.getByTestId('sound-target')).toHaveText(/For bass\s*now sawtooth/)
    await expect(kind(page, 'Instruments')).toBeChecked()
    await openFor(page, 'drums')
    await expect(page.getByTestId('sound-target')).toHaveText(/For drums\s*now RolandTR909/)
    await expect(kind(page, 'Drum kits')).toBeChecked()
    await expect(browser(page).locator('.sb-i.on')).toContainText('Roland TR909')
    await expect(browser(page).locator('.sb-i.on')).toContainText('In use')
    await expect(browser(page).locator('.sb-i.on')).toBeInViewport({ ratio: 1 })
})

test('gives a pattern of notes another instrument', async ({ page }) => {
    await open(page)
    await openFor(page, 'bass')
    await browser(page).getByRole('searchbox').fill('drawbar')
    await browser(page).getByRole('button', { name: 'Use Drawbar organ for bass', exact: true }).click()
    await expect.poll(() => code(page)).toContain('bass: note("c2 e2")\n  .s("gm_drawbar_organ")\n')
    await expect(page.getByRole('button', { name: 'Change the sound of bass', exact: true })).toHaveText('gm_drawbar_organ')
    await expect(browser(page).locator('.sb-i.on')).toContainText('In use')
})

test('gives a drum grid another kit', async ({ page }) => {
    await open(page)
    await openFor(page, 'drums')
    await browser(page).getByRole('searchbox').fill('808')
    await browser(page).getByRole('button', { name: 'Use Roland TR808 for drums', exact: true }).click()
    await expect.poll(() => code(page)).toContain('drums: s("bd*4")\n  .bank("RolandTR808")\n')
})

test('listening plays the sound and leaves the code alone', async ({ page }) => {
    await open(page)
    await page.evaluate(() => {
        const engine = (window as any).__weft.engine
        const heard: unknown[][] = []
        ;(window as any).__heard = heard
        engine.preview = (...args: unknown[]) => heard.push(['preview', ...args])
        engine.previewNote = (...args: unknown[]) => heard.push(['note', ...args])
    })
    await openFor(page, 'drums')
    await browser(page).getByRole('button', { name: 'Hear Roland TR909', exact: true }).click()
    await browser(page).getByRole('button', { name: 'Hear Roland TR909 Snare', exact: true }).click()
    await openFor(page, 'bass')
    await browser(page).getByRole('button', { name: 'Hear Electric piano 1', exact: true }).click()
    await kind(page, 'Samples').click()
    await browser(page).getByRole('button', { name: 'Hear Kalimba', exact: true }).click()
    expect(await page.evaluate(() => (window as any).__heard)).toEqual([
        ['preview', 'bd', 'RolandTR909'],
        ['preview', 'sd', 'RolandTR909'],
        ['note', 36, 'gm_epiano1', 0.6],
        ['preview', 'kalimba', null],
    ])
    expect(await code(page)).toBe(SONG)
})
