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

    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect.poll(async () => Number(await page.getByTestId('cycle').textContent()), { timeout: 20_000 }).toBeGreaterThanOrEqual(2)

    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
    await expect(page.getByTestId('cycle')).toHaveText('1')
    expect(errors).toEqual([])
})

test('shows an evaluation error with its line', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await page.evaluate(() => (window as any).__weft.engine.applyEdit({ from: 0, to: 0, insert: 'broken: s("bd"\n' }))
    await page.getByRole('button', { name: /^Update/ }).click()
    await expect(page.getByTestId('code-status')).toHaveText(/^Line \d+: Unexpected/)
})

const now = (page: import('@playwright/test').Page) => page.evaluate(() => (window as any).__weft.engine.now() as number)

test('the play button pauses, and the song goes on from where it was', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    const pause = page.getByRole('button', { name: 'Pause', exact: true })
    await expect(pause).toBeVisible()
    await expect.poll(() => now(page)).toBeGreaterThan(1.2)
    await pause.click()
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    await expect(page.getByTestId('code-status')).toHaveText('Paused')
    const at = await now(page)
    expect(at).toBeGreaterThan(1.2)
    await page.waitForTimeout(500)
    expect(await now(page)).toBe(at)
    await expect(page.getByTestId('cycle')).toHaveText(String(Math.floor(at) + 1))

    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect.poll(() => now(page)).toBeGreaterThan(at + 0.2)
    expect(await now(page)).toBeLessThan(at + 2)

    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await expect(page.getByTestId('cycle')).toHaveText('1')
    expect(await now(page)).toBe(0)
})

test('the keys that update and silence the song work from anywhere in the window, also when the code has an error', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    const status = page.getByTestId('code-status')
    const before = await code(page)
    await page.evaluate(() => {
        const { engine } = (window as any).__weft
        engine.applyEdit({ from: engine.getCode().length, to: engine.getCode().length, insert: '\nbroken: note("c3"' })
    })
    await page.getByTestId('code').locator('h2').click()
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.cm-editor')))).toBe(false)
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(status).toContainText(/^Line \d+: /)

    await page.evaluate((length) => {
        const { engine } = (window as any).__weft
        engine.applyEdit({ from: length, to: engine.getCode().length, insert: '' })
    }, before.length)
    await expect(status).toContainText(/^Line \d+: /)
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(status).toHaveText('Playing this code')
    await page.keyboard.press('ControlOrMeta+.')
    await expect(status).toHaveText('Stopped')
})
