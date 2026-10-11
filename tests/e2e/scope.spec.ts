import { expect, test, type Page } from '@playwright/test'

const SONG =
    'setcpm(120/4)\n\nhats: s("hh*8").bank("RolandTR909")\n._scope()\n\nperc: stack(\n  s("rim").struct("x ~ x ~   x ~ x ~   x ~ x ~   x ~ x ~"),\n)\n  .bank("RolandTR909")\n  .room(0.3)\n  ._scope()\n\nbass: note("c2 c2 c2 c2").s("sawtooth")._scope()\n\nquiet: note("c4").s("sine").gain(0)\n'

// How many rows of each scope in the code have something drawn on them. A flat line is a few
// rows; a wave is many.
const drawn = (page: Page) =>
    page.evaluate(() =>
        ([...document.querySelectorAll('.cm-editor canvas')] as HTMLCanvasElement[]).map((canvas) => {
            const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
            const rows = new Set<number>()
            for (let at = 3; at < data.length; at += 4) if (data[at] > 0) rows.add(Math.floor(at / 4 / canvas.width))
            return rows.size
        }),
    )
const peak = (page: Page) =>
    page.evaluate(() => {
        const wave = (window as any).__weft.engine.waveform() as Float32Array | null
        return wave ? Math.max(...Array.from(wave, Math.abs)) : 0
    })

test('every scope written in the code is drawn, moves with its pattern, and leaves the code whole', async ({ page }) => {
    await page.addInitScript((text) => localStorage.setItem('weft.song', text), SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.locator('.cm-editor canvas')).toHaveCount(3)
    for (const line of ['hats: s(', 'perc: stack(', '.room(0.3)', 'bass: note(', 'quiet: note(']) await expect(page.locator('.cm-line', { hasText: line })).toHaveCount(1)
    await expect.poll(async () => (await drawn(page)).filter((rows) => rows > 12).length, { timeout: 20000 }).toBe(3)
    await expect.poll(() => peak(page)).toBeGreaterThan(0.05)

    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await page.locator('.cm-line', { hasText: 'quiet: note(' }).click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type('\nextra: s("cp")._scope()')
    await page.getByRole('button', { name: /^Update/ }).click()
    await expect(page.locator('.cm-editor canvas')).toHaveCount(4)
    await expect(page.locator('.cm-line', { hasText: 'extra: s(' })).toHaveCount(1)
})
