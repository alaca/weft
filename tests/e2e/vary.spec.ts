import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\nbass: note("c2 e2 g2 b2").s("sawtooth")\n'

async function open(page: Page) {
    await page.addInitScript((value) => {
        if (!sessionStorage.getItem('seeded')) {
            localStorage.setItem('weft.song', value)
            sessionStorage.setItem('seeded', '1')
        }
    }, SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const hits = (page: Page, bar: number) => page.evaluate((at) => ((window as any).__weft.engine.events('bass', at, true) as unknown[]).length, bar)

test('a pattern is varied from a menu, every few bars or all the time, and the code says so', async ({ page }) => {
    await open(page)
    const vary = page.getByRole('button', { name: 'Vary bass', exact: true })
    await vary.click()
    const menu = page.getByRole('dialog', { name: 'Vary bass' })
    await menu.getByRole('radiogroup', { name: 'Every few bars for bass' }).getByRole('radio', { name: '4th bar' }).click()
    await menu.getByRole('radiogroup', { name: 'In that bar for bass' }).getByRole('radio', { name: 'Each hit twice' }).click()
    await expect.poll(() => code(page)).toContain('.lastOf(4, ply(2))')
    await expect.poll(() => hits(page, 3)).toBe(8)
    expect(await hits(page, 2)).toBe(4)

    await menu.getByRole('radiogroup', { name: 'Echo for bass' }).getByRole('radio', { name: 'An 8th after' }).click()
    await expect.poll(() => code(page)).toContain('.off(0.125, add(note(12)))')
    await expect(vary).toContainText('2')

    // A variation typed into the code shows in the menu as chosen.
    await page.evaluate((text) => (window as any).__weft.engine.setCode(text), SONG.replace('.s("sawtooth")', '.s("sawtooth").rev()'))
    await expect(menu.getByRole('radiogroup', { name: 'Backwards for bass' }).getByRole('radio', { name: 'On' })).toHaveAttribute('aria-checked', 'true')
    await menu.getByRole('radiogroup', { name: 'Backwards for bass' }).getByRole('radio', { name: 'Off' }).click()
    await expect.poll(() => code(page)).toBe(SONG)
    await expect(vary).not.toContainText('1')
})
