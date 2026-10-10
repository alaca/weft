import { expect, test } from '@playwright/test'

test('shows the four regions', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('top')).toBeVisible()
    await expect(page.getByTestId('controls')).toBeVisible()
    await expect(page.getByTestId('code')).toBeVisible()
    await expect(page.getByTestId('status')).toBeVisible()
    await expect(page.locator('.word')).toHaveText('Weft')
})

const ready = (page: import('@playwright/test').Page) => page.waitForFunction(() => Boolean((window as any).__weft))
const picked = (page: import('@playwright/test').Page) => page.evaluate(() => String(window.getSelection()))

test('dragging over the controls selects no text, and the code can still be selected', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    const strip = page.locator('.st').first()
    const box = (await strip.boundingBox())!
    await page.mouse.move(box.x + 20, box.y + 14)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 20, box.y + box.height - 10, { steps: 6 })
    await page.mouse.up()
    expect(await picked(page)).toBe('')

    const top = (await page.getByTestId('top').boundingBox())!
    await page.mouse.move(top.x + 10, top.y + 20)
    await page.mouse.down()
    await page.mouse.move(top.x + top.width - 10, top.y + 30, { steps: 6 })
    await page.mouse.up()
    expect(await picked(page)).toBe('')

    const line = page.locator('.cm-line').filter({ hasText: 'drums' }).first()
    const text = (await line.boundingBox())!
    await page.mouse.move(text.x + 2, text.y + text.height / 2)
    await page.mouse.down()
    await page.mouse.move(text.x + 120, text.y + text.height / 2, { steps: 6 })
    await page.mouse.up()
    expect((await picked(page)).length).toBeGreaterThan(3)
})

test('the copy button selects the whole song and copies it', async ({ page, context, browserName }) => {
    if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/')
    await ready(page)
    const code = await page.evaluate(() => (window as any).__weft.engine.getCode() as string)
    await page.getByRole('button', { name: 'Copy the code', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Copy the code', exact: true })).toHaveText('Copied')
    const lines = code.split('\n').filter((text) => text.trim())
    const selected = await picked(page)
    expect(selected).toContain(lines[0])
    expect(selected).toContain(lines[lines.length - 1])
    if (browserName === 'chromium') expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code)
    await expect(page.getByRole('button', { name: 'Copy the code', exact: true })).toHaveText('Copy', { timeout: 4000 })
})

test('the waveform and the song panel can be hidden from the top bar, and stay hidden after a restart', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    const wave = page.getByRole('button', { name: 'Waveform', exact: true })
    const panel = page.getByRole('button', { name: 'Song panel', exact: true })
    await expect(wave).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('output')).toBeVisible()
    await expect(page.getByTestId('song-length')).toBeVisible()

    await wave.click()
    await expect(wave).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('output')).toHaveCount(0)
    await expect(page.getByTestId('song-length')).toBeVisible()
    await panel.click()
    await expect(page.getByTestId('song-length')).toHaveCount(0)
    await expect(page.locator('.st').first()).toBeVisible()

    await page.reload()
    await ready(page)
    await expect(page.getByTestId('output')).toHaveCount(0)
    await expect(page.getByTestId('song-length')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Song panel', exact: true })).toHaveAttribute('aria-pressed', 'false')

    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await page.getByRole('button', { name: 'Waveform', exact: true }).click()
    await page.getByRole('button', { name: 'Song panel', exact: true }).click()
    await expect(page.getByTestId('output')).toBeVisible()
    await expect(page.getByTestId('song-length')).toBeVisible()
})
