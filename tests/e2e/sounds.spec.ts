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

test('opens from the top bar for listening and closes again', async ({ page }) => {
    await open(page)
    const button = page.getByRole('button', { name: 'Sounds', exact: true })
    await button.click()
    await expect(browser(page)).toBeVisible()
    await expect(browser(page).getByRole('searchbox', { name: 'Search sounds' })).toBeFocused()
    await expect(page.getByTestId('sound-target')).toContainText('Click a pattern to choose its sound')
    await expect(browser(page).getByRole('button', { name: /^Use / })).toHaveCount(0)
    await button.click()
    await expect(browser(page)).toHaveCount(0)
    await button.click()
    await browser(page).getByRole('button', { name: 'Close sounds' }).click()
    await expect(browser(page)).toHaveCount(0)
})

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

test('lists kits with their sounds, instruments, synths and samples', async ({ page }) => {
    await open(page)
    await openFor(page, 'drums')
    await expect(browser(page).locator('.sb-i')).toHaveCount(71)
    await expect(browser(page).getByRole('button', { name: 'Hear Roland TR909 Kick', exact: true })).toBeVisible()
    await kind(page, 'Instruments').click()
    await expect(browser(page).locator('.sb-i').first()).toContainText('Piano')
    await expect(browser(page).getByRole('button', { name: 'Hear Electric piano 1', exact: true })).toBeVisible()
    await kind(page, 'Synths').click()
    await expect(browser(page).locator('.sb-i b').first()).toHaveText('Sine wave')
    await kind(page, 'Samples').click()
    await expect(browser(page).getByRole('button', { name: 'Hear Kalimba', exact: true })).toBeVisible()
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

test('adds a sound to a pattern that names none', async ({ page }) => {
    await open(page)
    await openFor(page, 'lead')
    await kind(page, 'Synths').click()
    await browser(page).getByRole('button', { name: 'Use Sine wave for lead', exact: true }).click()
    await expect.poll(() => code(page)).toContain('lead: note("c4 e4")\n  .s("sine")\n')
})

test('gives a drum grid another kit', async ({ page }) => {
    await open(page)
    await openFor(page, 'drums')
    await browser(page).getByRole('searchbox').fill('808')
    await browser(page).getByRole('button', { name: 'Use Roland TR808 for drums', exact: true }).click()
    await expect.poll(() => code(page)).toContain('drums: s("bd*4")\n  .bank("RolandTR808")\n')
})

test('says what a pattern takes and shows the way there', async ({ page }) => {
    await open(page)
    await openFor(page, 'drums')
    await kind(page, 'Instruments').click()
    await expect(page.getByTestId('sound-hint')).toContainText('drums is a drum grid, so it takes a drum kit.')
    await expect(browser(page).getByRole('button', { name: /^Use / })).toHaveCount(0)
    await page.getByTestId('sound-hint').getByRole('button', { name: 'Show drum kits' }).click()
    await expect(kind(page, 'Drum kits')).toBeChecked()
    await expect(page.getByTestId('sound-hint')).toHaveCount(0)
    await page.getByTestId('strip-bass').locator('.st-n').click()
    await expect(page.getByTestId('sound-target')).toContainText('For bass')
    await expect(kind(page, 'Instruments')).toBeChecked()
    await kind(page, 'Drum kits').click()
    await expect(page.getByTestId('sound-hint')).toContainText('bass plays notes, so it takes an instrument, a synth or a sample.')
})

test('counts what matches in every kind while searching', async ({ page }) => {
    await open(page)
    await openFor(page, 'bass')
    await browser(page).getByRole('searchbox').fill('piano')
    await expect(kind(page, /Drum kits/)).toHaveText('Drum kits0')
    await expect(kind(page, /Instruments/)).toHaveText('Instruments4')
    await browser(page).getByRole('searchbox').fill('no such sound')
    await expect(browser(page)).toContainText('Nothing in Instruments matches.')
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

test('a sound that was only listened to is really heard', async ({ page }) => {
    await open(page)
    const loudest = () =>
        page.evaluate(() => {
            const data: Float32Array | null = (window as any).__weft.engine.waveform()
            let max = 0
            if (data) for (const value of data) max = Math.max(max, Math.abs(value))
            return max
        })
    await openFor(page, 'bass')
    await kind(page, 'Synths').click()
    await browser(page).getByRole('button', { name: 'Hear Square wave', exact: true }).click()
    await expect.poll(loudest, { timeout: 8000, intervals: [20] }).toBeGreaterThan(0.05)
})
