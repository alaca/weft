import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(960/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n  .mask("<0!2 1!2>")\n\nbass: note("c2 e2")\n  .s("sawtooth")\n'

const now = (page: Page) => page.evaluate(() => (window as any).__weft.engine.now() as number)
const sounding = (page: Page, cycle: number) => page.evaluate((at) => (window as any).__weft.engine.audible(at).length as number, cycle)
const mode = (page: Page, name: 'Song' | 'Live') => page.getByRole('group', { name: 'What plays' }).getByRole('button', { name, exact: true })

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

test('song plays the bars as they are filled, live plays every pattern whatever the bars say', async ({ page }) => {
    await open(page)
    await expect(mode(page, 'Song')).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    expect(await sounding(page, 0)).toBe(2)
    expect(await sounding(page, 2)).toBe(6)
    await expect(page.getByTestId('code-status')).toHaveText('Stopped', { timeout: 8000 })

    await mode(page, 'Live').click()
    await expect(mode(page, 'Live')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('live-note')).toContainText('every pattern plays')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect.poll(() => sounding(page, 0)).toBe(6)
    await expect.poll(() => now(page), { timeout: 10000 }).toBeGreaterThan(6)
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect(page.getByTestId('strip-drums')).not.toHaveClass(/rest/)

    await mode(page, 'Song').click()
    await expect(page.getByTestId('live-note')).toHaveCount(0)
    await expect(page.getByTestId('code-status')).toHaveText('Stopped', { timeout: 8000 })
    await expect(page.getByTestId('cycle')).toHaveText('1')
})
