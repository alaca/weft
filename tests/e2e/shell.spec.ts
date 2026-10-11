import { expect, test } from '@playwright/test'

const ready = (page: import('@playwright/test').Page) => page.waitForFunction(() => Boolean((window as any).__weft))
const picked = (page: import('@playwright/test').Page) => page.evaluate(() => String(window.getSelection()))

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
