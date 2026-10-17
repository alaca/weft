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
    await expect(page.getByTestId('code-status')).toHaveText('Playing')

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

const PICTURES = `setcpm(120/4)

cards: note("c3 e3 g3 c4").s("triangle")
  .punchcard()

curl: note("c3 e3 g3").s("sine")
  .spiral()

wheel: note("c4 e4 g4").s("sine")
  .pitchwheel()

bands: s("bd*4").bank("RolandTR909")
  .spectrum()

words: note("c3 e3").s("sawtooth")
  .wordfall()
`

// A punchcard, a spiral and a wordfall show a stretch of time around the present; a pitchwheel
// and a spectrum show the present. Each is drawn under its own line.
test('every picture Strudel has is drawn under the line that asks for it', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), PICTURES)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    await page.getByRole('button', { name: 'Live', exact: true }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing')
    const pictures = page.getByTestId('code').locator('.cm-content canvas')
    await expect(pictures).toHaveCount(5)
    const filled = () =>
        pictures.evaluateAll((canvases: HTMLCanvasElement[]) =>
            canvases.map((canvas) => {
                const dots = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
                let count = 0
                for (let at = 3; at < dots.length; at += 4) if (dots[at]) count++
                return count > 50
            }),
        )
    await expect.poll(filled, { timeout: 15000 }).toEqual([true, true, true, true, true])
    await expect(page.getByTestId('code-picture')).toBeHidden()
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    expect(errors).toEqual([])
})

const HYDRA = 'setcpm(120/4)\n\nawait initHydra()\nosc(10, 0.1, 1.2).kaleid(H("<3 6>")).out()\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n'

// Hydra comes with the app and draws behind the code while the code asks for it. Going, it
// gives back the names of Strudel's it took, such as speed.
test('hydra draws behind the code while the code asks for it, and leaves nothing behind', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), HYDRA)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    const canvas = page.getByTestId('code').locator('#hydra-canvas')
    await expect(canvas).toHaveCount(1, { timeout: 15000 })
    const size = await canvas.boundingBox()
    expect(size!.width).toBeGreaterThan(200)
    expect(await page.evaluate(() => typeof (window as any).osc)).toBe('function')

    await page.evaluate(async () => {
        const { engine } = (window as any).__weft
        engine.setCode('setcpm(120/4)\n\n// await initHydra()\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n')
        await engine.evaluate()
    })
    await expect(canvas).toHaveCount(0)
    expect(await page.evaluate(() => [typeof (window as any).osc, typeof (window as any).speed])).toEqual(['undefined', 'function'])
    expect(errors).toEqual([])
})
