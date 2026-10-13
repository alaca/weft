import { expect, test } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\nlead: note("c3 e3 g3 c4").s("triangle")\n  .pianoroll()\n\nbass: note("c2 ~ c2 ~").s("sawtooth")\n'

// Left to itself, Strudel draws a pianoroll on a canvas over the whole window.
test('a pianoroll written into the code is drawn under the line that asks for it, and nowhere else', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    await page.getByRole('button', { name: 'Live', exact: true }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')

    // The picture is in the code, between the line that asks for it and the pattern after it.
    const picture = page.getByTestId('code').locator('.cm-content canvas')
    await expect(picture).toHaveCount(1)
    const filled = () =>
        picture.evaluate((canvas: HTMLCanvasElement) => {
            const dots = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
            let count = 0
            for (let at = 3; at < dots.length; at += 4) if (dots[at]) count++
            return count
        })
    await expect.poll(filled, { timeout: 15000 }).toBeGreaterThan(100)
    const at = (await picture.boundingBox())!
    const asks = (await page.getByTestId('code').locator('.cm-line', { hasText: '.pianoroll()' }).boundingBox())!
    const next = (await page.getByTestId('code').locator('.cm-line', { hasText: 'bass:' }).boundingBox())!
    expect(at.y).toBeGreaterThanOrEqual(asks.y + asks.height - 1)
    expect(at.y + at.height).toBeLessThanOrEqual(next.y + 1)

    // Nothing is drawn over the window: the large canvas stays empty and its strip is not shown.
    expect(await page.locator('#test-canvas').count()).toBe(1)
    await expect(page.getByTestId('code-picture')).toBeHidden()
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    expect(errors).toEqual([])
})
