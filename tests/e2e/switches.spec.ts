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

test('wave tiles add a sound when the pattern names none', async ({ page }) => {
    await open(page, 'lead: note("c e g")\n')
    const lead = await panel(page, 'lead')
    await expect(lead.getByRole('button', { name: 'Triangle wave' })).toHaveAttribute('aria-pressed', 'true')
    await lead.getByRole('button', { name: 'Sawtooth wave' }).click()
    await expect.poll(() => code(page)).toBe('lead: note("c e g")\n  .s("sawtooth")\n')
})

test('a sample pattern has no wave tiles', async ({ page }) => {
    await open(page)
    const drums = await panel(page, 'drums')
    await expect(drums.getByRole('button', { name: 'Sawtooth wave' })).toHaveCount(0)
    await expect(drums.getByRole('button', { name: 'Add Speed' })).toBeVisible()
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

test('with no filter in the code, the switch only changes which knobs are offered', async ({ page }) => {
    await open(page)
    const drums = await panel(page, 'drums')
    const before = await code(page)
    await expect(drums.getByRole('button', { name: 'Add Cutoff' })).toBeVisible()
    await drums.getByRole('button', { name: 'High pass' }).click()
    await expect(drums.getByRole('button', { name: 'Add Low cut' })).toBeVisible()
    expect(await code(page)).toBe(before)
    await drums.getByRole('button', { name: 'Add Low cut' }).click()
    await expect.poll(() => code(page)).toContain('.hpf(slider(300, 20, 4000))')
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

test('the shape group draws the envelope', async ({ page }) => {
    await open(page)
    const bass = await panel(page, 'bass')
    await expect(bass.locator('svg.adsr polyline')).toHaveCount(1)
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

test('a tempo line is added when the code has none', async ({ page }) => {
    await open(page, 'drums: s("bd*4")\n')
    const tempo = page.getByTestId('tempo')
    await tempo.fill('90')
    await tempo.press('Enter')
    await expect.poll(() => code(page)).toBe('setcpm(90/4)\n\ndrums: s("bd*4")\n')
})

test('the tempo is locked when the code computes it', async ({ page }) => {
    await open(page, 'const speed = 30\nsetcpm(speed)\n\ndrums: s("bd*4")\n')
    await expect(page.getByTestId('tempo')).toBeDisabled()
})

test('other strips fold while a sound panel is open', async ({ page }) => {
    await open(page)
    const drums = page.getByTestId('strip-drums')
    await expect(drums.locator('.dg')).toHaveCount(1)
    const bass = await panel(page, 'bass')
    await expect(drums.locator('.dg')).toHaveCount(0)
    await expect(drums.locator('.mini')).toHaveCount(1)
    await bass.getByRole('button', { name: 'Sound controls for bass' }).click()
    await expect(drums.locator('.dg')).toHaveCount(1)
    await expect(drums.locator('.mini')).toHaveCount(0)
})

test('the selected strip stays open while another has its sound panel open', async ({ page }) => {
    await open(page)
    const drums = page.getByTestId('strip-drums')
    await panel(page, 'bass')
    await expect(drums.locator('.st-b')).toHaveCount(0)
    await drums.locator('.st-n').click()
    await expect(drums.locator('.st-b')).toHaveCount(1)
    await expect(drums.locator('.mini')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sound controls for bass' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('strip-drums').getByRole('button', { name: 'Mute drums', exact: true }).click()
    await expect(drums.locator('.st-b')).toHaveCount(1)
    await page.getByTestId('strip-drums').getByRole('button', { name: 'Mute drums', exact: true }).click()
    await expect(drums.locator('.st-b')).toHaveCount(1)
})

test('a pattern added while a sound panel is open is shown in full', async ({ page }) => {
    await open(page)
    await panel(page, 'bass')
    await page.getByTestId('add-pattern').getByRole('button', { name: 'Drums', exact: true }).click()
    const added = page.getByTestId('strip-drums2')
    await expect(added.locator('.st-b')).toHaveCount(1)
    await expect(added.getByRole('button', { name: 'bd step 1', exact: true })).toBeVisible()
})

test('a strip opened while a sound panel is open stays open when another is added or chosen', async ({ page }) => {
    await open(page)
    await panel(page, 'bass')
    const add = (name: string) => page.getByTestId('add-pattern').getByRole('button', { name, exact: true }).click()
    await add('Drums')
    await expect(page.getByTestId('strip-drums2').locator('.st-b')).toHaveCount(1)
    await add('Melody')
    await expect(page.getByTestId('strip-melody').locator('.st-b')).toHaveCount(1)
    await expect(page.getByTestId('strip-drums2').locator('.st-b')).toHaveCount(1)
    const drums = page.getByTestId('strip-drums')
    await expect(drums.locator('.st-b')).toHaveCount(0)
    await drums.locator('.st-n').click()
    await page.getByTestId('strip-melody').locator('.st-n').click()
    await expect(drums.locator('.st-b')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Sound controls for bass' })).toHaveAttribute('aria-pressed', 'true')
})

test('the strips fold afresh each time a sound panel is opened', async ({ page }) => {
    await open(page)
    const drums = page.getByTestId('strip-drums')
    const bass = await panel(page, 'bass')
    await drums.locator('.st-n').click()
    await expect(drums.locator('.st-b')).toHaveCount(1)
    await bass.getByRole('button', { name: 'Sound controls for bass' }).click()
    await expect(drums.locator('.st-b')).toHaveCount(1)
    await bass.getByRole('button', { name: 'Sound controls for bass' }).click()
    await expect(drums.locator('.st-b')).toHaveCount(0)
})

test('opening a sound panel selects its strip, so the one selected before folds', async ({ page }) => {
    await open(page)
    const drums = page.getByTestId('strip-drums')
    await drums.locator('.st-n').click()
    await expect(drums).toHaveClass(/sel/)
    await panel(page, 'bass')
    await expect(page.getByTestId('strip-bass')).toHaveClass(/sel/)
    await expect(drums.locator('.st-b')).toHaveCount(0)
    await expect(drums.locator('.mini')).toHaveCount(1)
})

test('the strip of what you hear shows the sound and has no volume of its own', async ({ page }) => {
    await open(page)
    const output = page.getByTestId('output')
    await expect(output.locator('canvas')).toBeVisible()
    await expect(output.getByRole('slider')).toHaveCount(0)
})
