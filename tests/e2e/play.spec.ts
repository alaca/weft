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
    await expect(page.getByTestId('code-status')).toHaveText('Changed')

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
    await expect
        .poll(() =>
            page.evaluate(() => {
                const id = localStorage.getItem('weft.current')
                return localStorage.getItem(`weft.songs.${id}`) ?? ''
            }),
        )
        .toContain('// kept')
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

test('a change made while paused is kept in step, and the song still goes on from where it was', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(() => now(page)).toBeGreaterThan(1.1)
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    const at = await now(page)
    await page.getByTestId('strip-bass').getByRole('button', { name: 'Mute bass', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Paused')
    expect(await now(page)).toBe(at)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(() => now(page)).toBeGreaterThan(at + 0.2)
    expect(await now(page)).toBeLessThan(at + 2)
})

test('choosing a bar while paused starts from that bar', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await page.getByRole('group', { name: 'What plays' }).getByRole('button', { name: 'Song', exact: true }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(() => now(page)).toBeGreaterThan(0.3)
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await page.getByRole('button', { name: 'Start from bar 9', exact: true }).click()
    await expect(page.getByTestId('cycle')).toHaveText('9')
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(() => now(page)).toBeGreaterThan(8.1)
    expect(await now(page)).toBeLessThan(10)
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
