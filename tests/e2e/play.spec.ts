import { expect, test, type Page } from '@playwright/test'

const ready = (page: Page) => page.waitForFunction(() => Boolean((window as any).__weft))
const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)

test('plays, counts cycles and stops', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.goto('/')
    await ready(page)

    await expect(page.getByTestId('tempo')).toHaveValue('124')
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')

    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect.poll(async () => Number(await page.getByTestId('cycle').textContent()), { timeout: 20_000 }).toBeGreaterThanOrEqual(2)

    await page.getByRole('button', { name: 'Stop' }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
    await expect(page.getByTestId('cycle')).toHaveText('1')
    expect(errors).toEqual([])
})

test('says when the code has changed since it was last played', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')

    await page.evaluate(() => (window as any).__weft.engine.applyEdit({ from: 0, to: 0, insert: '// edited\n' }))
    await expect(page.getByTestId('code-status')).toContainText('Changed. Press')

    await page.getByRole('button', { name: /^Update/ }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
})

test('shows an evaluation error with its line', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await page.evaluate(() => (window as any).__weft.engine.applyEdit({ from: 0, to: 0, insert: 'broken: s("bd"\n' }))
    await page.getByRole('button', { name: /^Update/ }).click()
    await expect(page.getByTestId('code-status')).toHaveText(/^Line \d+: Unexpected/)
})

test('switches between controls, both and code', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await page.getByRole('button', { name: 'Code', exact: true }).click()
    await expect(page.getByTestId('controls')).toBeHidden()
    await expect(page.getByTestId('code')).toBeVisible()
    await page.getByRole('button', { name: 'Controls', exact: true }).click()
    await expect(page.getByTestId('code')).toBeHidden()
    await expect(page.getByTestId('controls')).toBeVisible()
    await page.getByRole('button', { name: 'Both', exact: true }).click()
    await expect(page.getByTestId('code')).toBeVisible()
    await expect(page.getByTestId('controls')).toBeVisible()
})

test('moves an inline slider and rewrites its number in the code', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    const slider = page.locator('.cm-slider input').first()
    await expect(slider).toBeVisible()
    await slider.evaluate((el: HTMLInputElement) => {
        el.value = '0.5'
        el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await expect.poll(() => code(page)).toContain('slider(0.5, 0, 1)')
})

test('remembers the code across a reload', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await page.evaluate(() => (window as any).__weft.engine.applyEdit({ from: 0, to: 0, insert: '// kept\n' }))
    await expect.poll(() => page.evaluate(() => localStorage.getItem('weft.song') ?? '')).toContain('// kept')
    await page.reload()
    await ready(page)
    expect(await code(page)).toContain('// kept')
})

test('says how to name a pattern when the code has none', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('weft.song', 's("bd*4")'))
    await page.goto('/')
    await ready(page)
    await expect(page.getByTestId('controls')).toContainText('Give a pattern a name')
})
