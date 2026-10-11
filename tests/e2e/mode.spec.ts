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

test('the mode is kept, and a file is always made of the song', async ({ page }) => {
    test.setTimeout(90000)
    await open(page)
    await mode(page, 'Live').click()
    await page.reload()
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(mode(page, 'Live')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    const loud = await page.evaluate(async () => {
        const made = await (window as any).__weft.engine.render({ bars: 4, ringSeconds: 0, sampleRate: 44100 })
        const left: Float32Array = made.channels[0]
        const bar = made.secondsPerBar * 44100
        const peak = (from: number, to: number) => {
            let most = 0
            for (let at = Math.floor(from * bar); at < Math.floor(to * bar); at++) most = Math.max(most, Math.abs(left[at]))
            return most
        }
        return { first: peak(0, 0.2), third: peak(2, 2.2) }
    })
    expect(loud.third).toBeGreaterThan(loud.first * 1.5)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(() => sounding(page, 0)).toBe(6)
})
