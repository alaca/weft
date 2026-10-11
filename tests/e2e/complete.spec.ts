import { expect, test, type Page } from '@playwright/test'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)

async function open(page: Page) {
    await page.addInitScript(() => localStorage.setItem('weft.song', 'setcpm(120/4)\n\ndrums: s("bd*4")\n'))
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await page.locator('.cm-line', { hasText: 'drums: s(' }).click()
    await page.keyboard.press('ControlOrMeta+End')
}

test('the code offers the functions that fit what is being typed, says what they do, and writes the one chosen', async ({ page }) => {
    await open(page)
    await page.keyboard.type('\nbass: note("c2").roo')
    const offers = page.locator('.cm-tooltip-autocomplete li')
    await expect(offers.first()).toHaveText('room')
    await expect(offers).toContainText(['room', 'roomsize'])
    const about = page.locator('.cm-completionInfo')
    await expect(about).toContainText('room')
    await expect(about).toContainText('Examples')
    const box = (await about.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(1440)
    expect(Math.round(box.width)).toBeLessThanOrEqual(302)

    // For an instant after the offers appear or the choice moves, the editor leaves the arrow
    // keys and Enter to the code, so that a key meant for the code is not swallowed. Nobody
    // presses keys that fast; the test waits as a person would.
    await page.waitForTimeout(200)
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(200)
    await page.keyboard.press('Enter')
    await expect(offers).toHaveCount(0)
    expect(await code(page)).toContain('bass: note("c2").roomdim')
})

test('the offers go away with Escape and leave what was typed', async ({ page }) => {
    await open(page)
    await page.keyboard.type('\nbass: note("c2").lp')
    await expect(page.locator('.cm-tooltip-autocomplete li').first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.cm-tooltip-autocomplete')).toHaveCount(0)
    await page.keyboard.type('f(800)')
    expect(await code(page)).toContain('bass: note("c2").lpf(800)')
})
