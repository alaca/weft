import { expect, test, type Page } from '@playwright/test'

const SONG = `setcpm(120/4)

drums: s("bd*4, hh*8")
  .bank("RolandTR909")

bass: note("d2 ~ d2 f2")
  .s("sawtooth")
  .lpf(slider(1200, 200, 4000))
  .lpq(8)
  .decay(.2)
`

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)

async function open(page: Page, song = SONG) {
    await page.addInitScript((text) => {
        if (!sessionStorage.getItem('seeded')) {
            localStorage.setItem('weft.song', text)
            sessionStorage.setItem('seeded', '1')
        }
    }, song)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

async function panel(page: Page, id: string) {
    const strip = page.getByTestId(`strip-${id}`)
    await strip.getByRole('button', { name: `Sound controls for ${id}` }).click()
    return strip
}

test('wave tiles rewrite the sound', async ({ page }) => {
    await open(page)
    const bass = await panel(page, 'bass')
    await expect(bass.getByRole('button', { name: 'Sawtooth wave' })).toHaveAttribute('aria-pressed', 'true')
    await bass.getByRole('button', { name: 'Square wave' }).click()
    await expect.poll(() => code(page)).toContain('.s("square")')
    await expect(bass.getByRole('button', { name: 'Square wave' })).toHaveAttribute('aria-pressed', 'true')
})

test('the filter type switch renames the filter calls', async ({ page }) => {
    await open(page)
    const bass = await panel(page, 'bass')
    await expect(bass.getByRole('button', { name: 'Low pass' })).toHaveAttribute('aria-pressed', 'true')
    await bass.getByRole('button', { name: 'High pass' }).click()
    await expect.poll(() => code(page)).toContain('.hpf(slider(1200, 200, 4000))\n  .hpq(8)')
    await expect(bass.getByRole('slider', { name: 'Low cut' })).toBeVisible()
    await bass.getByRole('button', { name: 'Low pass' }).click()
    await expect.poll(() => code(page)).toContain('.lpf(slider(1200, 200, 4000))\n  .lpq(8)')
})

test('the echo switch writes, changes and removes the echo time', async ({ page }) => {
    await open(page)
    const bass = await panel(page, 'bass')
    await bass.getByRole('button', { name: 'Echo every eighth' }).click()
    await expect.poll(() => code(page)).toContain('.delaysync(0.125)')
    await expect(bass.getByRole('button', { name: 'Echo every eighth' })).toHaveAttribute('aria-pressed', 'true')
    await bass.getByRole('button', { name: 'Echo every quarter' }).click()
    await expect.poll(() => code(page)).toContain('.delaysync(0.25)')
    await bass.getByRole('button', { name: 'Echo every quarter' }).click()
    await expect.poll(() => code(page)).not.toContain('delaysync')
})

test('the browser lists other controls, searches them and adds one', async ({ page }) => {
    await open(page)
    const bass = await panel(page, 'bass')
    await bass.getByRole('button', { name: 'Browse all controls' }).click()
    const list = bass.getByRole('region', { name: 'All controls' })
    await expect(list.getByRole('button', { name: /Phaser/ })).toBeVisible()
    await expect(list.getByRole('button', { name: /Cutoff/ })).toHaveCount(0)
    await list.getByRole('searchbox', { name: 'Search controls' }).fill('grit')
    await expect(list.getByRole('button')).toHaveText([/Crush/])
    await list.getByRole('button', { name: /Crush/ }).click()
    await expect.poll(() => code(page)).toContain('.crush(slider(8, 1, 16))')
    await expect(bass.getByRole('slider', { name: 'Crush' })).toBeVisible()
    await expect(list.getByText('Nothing matches')).toBeVisible()
})

test('the tempo can be edited from the top bar', async ({ page }) => {
    await open(page)
    const tempo = page.getByTestId('tempo')
    await expect(tempo).toHaveValue('120')
    await tempo.fill('140')
    await tempo.press('Enter')
    await expect.poll(() => code(page)).toContain('setcpm(140/4)')
    await expect(tempo).toHaveValue('140')
})
