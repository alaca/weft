import { expect, test } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\nlead: note("c3 e3 g3 c4").s("triangle").pianoroll()\n'

// Strudel draws a pianoroll on a canvas over the whole window when it is left to make one.
test('a pianoroll written into the code is drawn in a strip under the code, and nowhere else', async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    await page.getByRole('button', { name: 'Live', exact: true }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')

    // Something is drawn, on the one canvas there is.
    const drawn = () =>
        page.evaluate(() => {
            const canvas = document.querySelector('#test-canvas') as HTMLCanvasElement
            const dots = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
            let filled = 0
            for (let at = 3; at < dots.length; at += 4) if (dots[at]) filled++
            return filled
        })
    await expect.poll(drawn, { timeout: 15000 }).toBeGreaterThan(100)
    expect(await page.locator('#test-canvas').count()).toBe(1)
    expect(await page.getByTestId('code').locator('#test-canvas').count()).toBe(1)

    // It lies within the code pane, under the text and not over it.
    const picture = (await page.locator('#test-canvas').boundingBox())!
    const code = (await page.getByTestId('code').boundingBox())!
    const text = (await page.getByTestId('code').locator('.ed').boundingBox())!
    expect(picture.x).toBeGreaterThanOrEqual(code.x)
    expect(picture.y).toBeGreaterThanOrEqual(text.y + text.height - 1)
    expect(picture.x + picture.width).toBeLessThanOrEqual(code.x + code.width + 1)
    expect(picture.y + picture.height).toBeLessThanOrEqual(code.y + code.height + 1)
    await page.getByRole('button', { name: 'Stop', exact: true }).click()

    // Without a picture in the code the strip is gone and the code has all the room.
    await page.evaluate(() => {
        const engine = (window as any).__weft.engine
        const code: string = engine.getCode()
        const at = code.indexOf('.pianoroll()')
        engine.applyEdit({ from: at, to: at + '.pianoroll()'.length, insert: '' })
    })
    await expect(page.getByTestId('code-picture')).toBeHidden()
})
