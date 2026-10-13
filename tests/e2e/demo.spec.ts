import { expect, test, type Page } from '@playwright/test'

// What the browser itself keeps for this address. The demo puts a place of its own in front of
// it, so it is read through a frame, which gets the browser's.
const keptByBrowser = (page: Page) =>
    page.evaluate(() => {
        const frame = document.createElement('iframe')
        document.body.append(frame)
        const kept = { ...frame.contentWindow!.localStorage }
        frame.remove()
        return kept
    })

test('the demo opens into a song, plays it, lets it be changed, and keeps nothing', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.goto('/?demo')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    const before = await keptByBrowser(page)

    await expect(page.getByTestId('start')).toHaveCount(0)
    await expect(page.getByTestId('song-name')).toHaveText('Night shift')
    await expect(page.getByTestId('tempo')).toHaveValue('174')
    for (const gone of ['Save', 'New song', 'Open a file', 'Export', 'Publish', 'Jams', 'Your account', 'Copy the code']) await expect(page.getByRole('button', { name: gone, exact: true })).toHaveCount(0)
    await expect(page.getByRole('radio', { name: 'Drum kits' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Yours' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Get the app' })).toHaveAttribute('href', /\/download$/)

    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect.poll(async () => Number(await page.getByTestId('cycle').textContent()), { timeout: 20_000 }).toBeGreaterThanOrEqual(2)
    await page.getByRole('button', { name: 'Stop', exact: true }).click()

    // A change is taken, and can be taken back.
    await page.getByTestId('tempo').fill('120')
    await page.getByTestId('tempo').press('Enter')
    await page.getByTestId('song-name').click()
    await page.getByRole('button', { name: 'Start this song over' }).click()
    await expect(page.getByTestId('tempo')).toHaveValue('174')

    // Save does nothing here, and does not bring up the browser's own saving either.
    await page.keyboard.press('ControlOrMeta+s')

    await page.getByRole('button', { name: 'Open Night bus' }).click()
    await expect(page.getByTestId('song-name')).toHaveText('Night bus')
    await expect(page.getByTestId('tempo')).toHaveValue('124')

    await page.waitForTimeout(700)
    expect(await keptByBrowser(page)).toEqual(before)
    expect(await page.evaluate(async () => (await indexedDB.databases()).length)).toBe(0)
    expect(errors).toEqual([])
})
