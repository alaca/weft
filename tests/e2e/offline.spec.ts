import { expect, test, type Page } from '@playwright/test'

const heard = (page: Page) =>
    page.evaluate(() => {
        const wave = (window as any).__weft.engine.waveform() as Float32Array | null
        return wave ? Math.max(...Array.from(wave, Math.abs)) : 0
    })
// How many fetched files are kept on this machine.
const kept = (page: Page) =>
    page.evaluate(
        () =>
            new Promise<number>((resolve) => {
                const request = indexedDB.open('weft-fetched')
                request.onerror = () => resolve(0)
                request.onsuccess = () => {
                    const database = request.result
                    if (!database.objectStoreNames.contains('index')) return resolve(0)
                    const count = database.transaction('index', 'readonly').objectStore('index').count()
                    count.onsuccess = () => resolve(count.result)
                    count.onerror = () => resolve(0)
                }
            }),
    )
const open = async (page: Page) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    await page.getByRole('button', { name: 'Change the sound of drums', exact: true }).click()
}

test('the sounds that were fetched once are there, and play, when the network is gone', async ({ page }) => {
    await open(page)
    const kick = page.getByTestId('sound-browser').getByRole('button', { name: 'Hear Roland TR909', exact: true })
    await kick.click()
    await expect.poll(() => heard(page)).toBeGreaterThan(0.05)
    // The six lists of sounds, and at least the kick that was just heard.
    await expect.poll(() => kept(page)).toBeGreaterThanOrEqual(7)

    // From here on nothing can be fetched from where the sounds are kept.
    let asked = 0
    await page.context().route(/raw\.githubusercontent\.com|felixroos\.github\.io/, (route) => {
        asked++
        return route.abort()
    })
    await open(page)
    await kick.click()
    await expect.poll(() => heard(page)).toBeGreaterThan(0.05)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect.poll(async () => Number(await page.getByTestId('cycle').textContent()), { timeout: 20_000 }).toBeGreaterThanOrEqual(2)
    // The lists were asked for anew, in vain, and the copies answered meanwhile.
    expect(asked).toBeGreaterThan(0)
})
