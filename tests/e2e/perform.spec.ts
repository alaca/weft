import { expect, test, type Page } from '@playwright/test'

// A kick on every eighth of a bar that lasts four seconds.
const SONG = 'setcpm(60/4)\n\nbeat: s("bd*8").bank("RolandTR909")\n'
const QUIET = 'setcpm(60/4)\n\nbeat: s("~").bank("RolandTR909")\n'

async function open(page: Page) {
    await page.addInitScript((value) => {
        if (!sessionStorage.getItem('seeded')) {
            localStorage.setItem('weft.song', value)
            sessionStorage.setItem('seeded', '1')
        }
    }, SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
}

const now = (page: Page) => page.evaluate(() => (window as any).__weft.engine.now() as number)
// The loudest the song was over a while, looked at every few hundredths of a second, so that the
// gaps between the kicks are not taken for silence.
const loudestOver = (page: Page, ms: number) =>
    page.evaluate(async (span) => {
        let loudest = 0
        for (const until = performance.now() + span; performance.now() < until; ) {
            const wave = (window as any).__weft.engine.waveform() as Float32Array | null
            if (wave) loudest = Math.max(loudest, ...Array.from(wave, Math.abs))
            await new Promise((done) => setTimeout(done, 30))
        }
        return loudest
    }, ms)
const updateTo = async (page: Page, code: string) => {
    await page.evaluate((text) => (window as any).__weft.engine.setCode(text), code)
    await page.getByRole('button', { name: /^Update/ }).click()
}

test('a change of the code comes in at once, or waits for the next bar while the song plays on as it was', async ({ page }) => {
    test.setTimeout(60_000)
    await open(page)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(() => loudestOver(page, 600)).toBeGreaterThan(0.01)

    await updateTo(page, QUIET)
    await expect.poll(() => loudestOver(page, 800), { timeout: 4000 }).toBeLessThan(0.001)
    await updateTo(page, SONG)
    await expect.poll(() => loudestOver(page, 600)).toBeGreaterThan(0.01)

    await page.getByRole('button', { name: 'Options for updating', exact: true }).click()
    await page.getByRole('menuitemradio', { name: 'On the next bar' }).click()
    await expect(page.getByRole('button', { name: 'Options for updating', exact: true })).toContainText('Bar')
    // Early in a bar, so that most of it is left to wait through.
    await expect.poll(() => now(page).then((at) => at % 1), { timeout: 8000, intervals: [50] }).toBeLessThan(0.15)
    const bar = Math.floor(await now(page))
    await updateTo(page, QUIET)
    await expect(page.getByTestId('code-status')).toHaveText(/^In \d+ beats?$/)
    expect(await loudestOver(page, 1500)).toBeGreaterThan(0.01)
    await expect.poll(() => now(page), { timeout: 6000 }).toBeGreaterThan(bar + 1.2)
    expect(await loudestOver(page, 800)).toBeLessThan(0.001)
    await expect(page.getByTestId('code-status')).toHaveText('Playing')
})

test('the performance view puts the code over the whole window, as large as is asked, with the strips out of it', async ({ page }) => {
    await open(page)
    const size = () => page.locator('.cm-content').first().evaluate((content) => getComputedStyle(content).fontSize)
    await expect(page.getByTestId('strip-beat')).toBeVisible()
    expect(await size()).toBe('12.5px')

    await page.getByRole('button', { name: 'Performance view', exact: true }).click()
    await expect(page.getByTestId('strip-beat')).toHaveCount(0)
    await expect.poll(size).toBe('20px')
    const wide = await page.getByTestId('code').evaluate((pane) => pane.getBoundingClientRect().width / window.innerWidth)
    expect(wide).toBeGreaterThan(0.95)
    await page.keyboard.press('Meta+=')
    await expect.poll(size).toBe('22px')
    await page.getByRole('button', { name: 'Smaller code', exact: true }).click()
    await page.getByRole('button', { name: 'Smaller code', exact: true }).click()
    await expect.poll(size).toBe('18px')

    await page.keyboard.press('Meta+Shift+F')
    await expect(page.getByTestId('strip-beat')).toBeVisible()
    await expect.poll(size).toBe('12.5px')
    // The size chosen is kept for the next time.
    await page.getByRole('button', { name: 'Performance view', exact: true }).click()
    await expect.poll(size).toBe('18px')
})
