import { expect, test, type Page } from '@playwright/test'

const last = async (page: Page) => (await page.evaluate(() => (window as any).__weft.engine.getCode() as string)).trim().split('\n\n').pop() ?? ''

// Two seconds that go like a drum loop: a low thump and a burst of noise in turn.
function loop(seconds = 2): Buffer {
    const rate = 22050
    const frames = Math.round(rate * seconds)
    const file = Buffer.alloc(44 + frames * 2)
    file.write('RIFF', 0, 'latin1')
    file.writeUInt32LE(36 + frames * 2, 4)
    file.write('WAVEfmt ', 8, 'latin1')
    file.writeUInt32LE(16, 16)
    file.writeUInt16LE(1, 20)
    file.writeUInt16LE(1, 22)
    file.writeUInt32LE(rate, 24)
    file.writeUInt32LE(rate * 2, 28)
    file.writeUInt16LE(2, 32)
    file.writeUInt16LE(16, 34)
    file.write('data', 36, 'latin1')
    file.writeUInt32LE(frames * 2, 40)
    let seed = 7
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
    for (let at = 0; at < frames; at++) {
        const beat = ((at / rate) * 4) % 1
        const low = Math.floor((at / rate) * 4) % 2 === 0
        const sound = low ? Math.sin(2 * Math.PI * 70 * beat * 0.25) * Math.exp(-beat * 9) : noise() * Math.exp(-beat * 14) * 0.8
        file.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sound)) * 24000), 44 + at * 2)
    }
    return file
}

test('a sound of your own is cut into parts that are played in any order, from a grid', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.addInitScript(() => localStorage.setItem('weft.layout', JSON.stringify({ sounds: true, mixer: false, jams: false })))
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready')

    await page.getByRole('radio', { name: 'Yours' }).click()
    await page.getByTestId('own-files').setInputFiles({ name: 'My break.wav', mimeType: 'audio/wav', buffer: loop() })
    await page.getByRole('button', { name: 'Slice My break', exact: true }).click()
    // It starts as the sound as it was, in sixteen parts, with the sound drawn over the grid.
    const strip = page.getByTestId('strip-slices')
    expect(await last(page)).toContain('slices: s("my_break").splice(16, "0 1 2 3   4 5 6 7   8 9 10 11   12 13 14 15")')
    await expect(strip.getByRole('button', { name: 'Hear part 16', exact: true })).toBeVisible()
    await expect(strip.locator('.sl-w path')).toHaveAttribute('d', /^M/)
    await strip.getByRole('button', { name: 'Hear part 3', exact: true }).click()

    // A part goes onto another step with a click in its row, and comes off the same way.
    await strip.getByRole('button', { name: '1 step 5', exact: true }).click()
    await strip.getByRole('button', { name: '5 step 5', exact: true }).click()
    expect(await last(page)).toContain('.splice(16, "0 1 2 3   0 5 6 7   8 9 10 11   12 13 14 15")')
    await strip.getByRole('button', { name: 'Backwards', exact: true }).click()
    expect(await last(page)).toContain('.splice(16, "15 14 13 12   11 10 9 8   7 6 5 4   3 2 1 0")')

    await page.getByRole('button', { name: 'Live', exact: true }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect(strip.locator('.sl-p.now')).toHaveCount(1)
    await expect.poll(async () => Number(await page.getByTestId('cycle').textContent()), { timeout: 20_000 }).toBeGreaterThanOrEqual(2)
    await page.getByRole('button', { name: 'Stop', exact: true }).click()

    // Cut finer it sounds the same; over two bars the parts are other stretches, put in order.
    await strip.getByRole('button', { name: '32 steps a cycle', exact: true }).click()
    expect(await last(page)).toContain('.splice(32, "30 31 28 29   26 27 24 25')
    await strip.getByRole('button', { name: 'Length 2 cycles', exact: true }).click()
    expect(await last(page)).toContain('.splice(32, "[0 1 2 3   4 5 6 7   8 9 10 11   12 13 14 15   16 17 18 19')
    await strip.getByRole('button', { name: 'Fit to the tempo', exact: true }).click()
    expect(await last(page)).toContain('s("my_break").slice(32, ')
    expect(errors).toEqual([])
})
