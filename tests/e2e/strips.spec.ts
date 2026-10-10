import { expect, test, type Page } from '@playwright/test'

const SONG = `setcpm(120/4)

drums: s("bd*4, [~ cp]*2, hh*8")
  .bank("RolandTR909")

bass: note("d2 ~ d2 f2 ~ d2 a1 [c2 d2]")
  .s("sawtooth")

_lead: n("0 2 4 7").scale("D4:minor").s("triangle")
`

const ready = (page: Page) => page.waitForFunction(() => Boolean((window as any).__weft))
const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const audible = (page: Page) =>
    page.evaluate(() => [...new Set((window as any).__weft.engine.audible(0).map((e: any) => e.sound))].sort() as string[])

async function open(page: Page, song?: string) {
    if (song) await page.addInitScript((text) => localStorage.setItem('weft.song', text), song)
    await page.goto('/')
    await ready(page)
}

test('draws one strip per named pattern of the starter song, in code order', async ({ page }) => {
    await open(page)
    const order = await page.locator('[data-testid^="strip-"]').evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')))
    expect(order).toEqual(['strip-drums', 'strip-bass', 'strip-chords', 'strip-lead'])
    await expect(page.getByTestId('strip-lead')).toHaveClass(/muted/)
})

test('shows the sound, the lines and the right kind of picture', async ({ page }) => {
    await open(page, SONG)
    const drums = page.getByTestId('strip-drums')
    await expect(drums).toContainText('RolandTR909')
    await expect(drums).toContainText('lines 3 to 4')
    await expect(drums.locator('.rn')).toHaveText(['bd', 'cp', 'hh'])
    await expect(drums.locator('.pad')).toHaveCount(48)
    await expect(drums.locator('.prow').nth(0).locator('.pad.on')).toHaveCount(4)
    await expect(drums.locator('.prow').nth(1).locator('.pad.on')).toHaveCount(2)
    await expect(drums.locator('.prow').nth(2).locator('.pad.on')).toHaveCount(8)

    const bass = page.getByTestId('strip-bass')
    await expect(bass.locator('.nt')).toHaveCount(7)
    await expect(bass.locator('.nr-k span')).toHaveText(['g2', 'c2', 'g1'])

    const lead = page.getByTestId('strip-lead')
    await expect(lead).toHaveClass(/muted/)
    await expect(lead).toContainText('line 9, muted')
})

test('muting a strip leaves it open, so the pattern can still be seen and changed', async ({ page }) => {
    await open(page, SONG)
    const drums = page.getByTestId('strip-drums')
    await page.getByRole('button', { name: 'Mute drums', exact: true }).click()
    await expect(drums).toHaveClass(/muted/)
    await expect(drums.locator('.st-b')).toHaveCount(1)
    await expect(drums.locator('.prow').nth(0).locator('.pad.on')).toHaveCount(4)
    await expect(drums.getByRole('button', { name: 'Sound controls for drums' })).toBeVisible()
    await drums.getByRole('button', { name: 'bd step 2', exact: true }).click()
    await expect.poll(() => code(page)).toContain('_drums: stack(\n  s("bd").struct("x x ~ ~')
    await page.getByRole('button', { name: 'Mute drums', exact: true }).click()
    await expect(drums).not.toHaveClass(/muted/)
    await expect(drums.locator('.st-b')).toHaveCount(1)
    await expect.poll(() => code(page)).toContain('\ndrums: stack(\n  s("bd").struct("x x ~ ~')
})

test('a pattern that is muted in the code is drawn in full, without a moving line', async ({ page }) => {
    await open(page, SONG)
    const lead = page.getByTestId('strip-lead')
    await expect(lead.locator('.st-b')).toHaveCount(1)
    await expect(lead.locator('.roll rect.n')).toHaveCount(4)
    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect(page.getByTestId('strip-bass').locator('.ph')).toHaveCount(1)
    await expect(lead.locator('.ph')).toHaveCount(0)
})

test('mute writes the underscore into the code and takes the pattern out of what plays', async ({ page }) => {
    await open(page, SONG)
    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')

    await page.getByRole('button', { name: 'Mute bass' }).click()
    await expect.poll(() => code(page)).toContain('_bass: note(')
    await expect(page.getByTestId('strip-bass')).toHaveClass(/muted/)
    await expect.poll(() => audible(page)).not.toContain('sawtooth')

    await page.getByRole('button', { name: 'Mute bass' }).click()
    await expect.poll(() => code(page)).not.toContain('_bass')
    await expect.poll(() => audible(page)).toContain('sawtooth')
})

test('solo silences the others and leaves the code alone', async ({ page }) => {
    await open(page, SONG)
    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    const before = await code(page)

    await page.getByRole('button', { name: 'Solo bass' }).click()
    await expect.poll(() => audible(page)).toEqual(['sawtooth'])
    expect(await code(page)).toBe(before)

    await page.getByRole('button', { name: 'Solo bass' }).click()
    await expect.poll(async () => (await audible(page)).length).toBeGreaterThan(1)
})

test('selecting a strip marks its lines, and the cursor selects the strip', async ({ page }) => {
    await open(page, SONG)
    await page.getByTestId('strip-drums').locator('.st-n').click()
    await expect(page.getByTestId('strip-drums')).toHaveClass(/sel/)
    await expect(page.locator('.cm-line.weft-sel')).toHaveCount(2)
    await expect(page.locator('.cm-line.weft-block')).toHaveCount(5)

    await page.locator('.cm-line', { hasText: 'bass: note(' }).click()
    await expect(page.getByTestId('strip-bass')).toHaveClass(/sel/)
    await expect(page.getByTestId('strip-drums')).not.toHaveClass(/sel/)
})

test('keeps the strips and disables their buttons while the code does not parse', async ({ page }) => {
    await open(page, SONG)
    await page.evaluate(() => (window as any).__weft.engine.applyEdit({ from: 0, to: 0, insert: 'broken: s("bd"\n' }))
    await expect(page.locator('[data-testid^="strip-"]')).toHaveCount(3)
    await expect(page.getByRole('button', { name: 'Mute drums' })).toBeDisabled()

    await page.evaluate(() => (window as any).__weft.engine.applyEdit({ from: 0, to: 15, insert: '' }))
    await expect(page.getByRole('button', { name: 'Mute drums' })).toBeEnabled()
})

test('updates the strips when the code is changed and played', async ({ page }) => {
    await open(page, SONG)
    await page.evaluate(() => {
        const { engine } = (window as any).__weft
        const text: string = engine.getCode()
        const at = text.indexOf('bd*4')
        engine.applyEdit({ from: at, to: at + 4, insert: 'bd*2' })
    })
    await page.getByRole('button', { name: /^Update/ }).click()
    await expect(page.getByTestId('strip-drums').locator('.prow').nth(0).locator('.pad.on')).toHaveCount(2)
})

test('moves a playhead across the bass while playing', async ({ page }) => {
    await open(page, SONG)
    await expect(page.getByTestId('strip-bass').locator('.ph')).toHaveCount(0)
    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.getByTestId('strip-bass').locator('.ph')).toHaveCount(1)
})

test('says the code has an error when a saved song does not parse', async ({ page }) => {
    await open(page, 'drums: s("bd*4"\n')
    await expect(page.getByTestId('controls')).toContainText('The code has an error')
    await expect(page.getByTestId('controls')).not.toContainText('Give a pattern a name')
})

test('draws read-only piano rolls in pixel-scale units, which WebKit needs to repaint them correctly', async ({ page }) => {
    await open(page, 'keys: n("0 2 4 2").scale("C:major")\n')
    const svg = page.getByTestId('strip-keys').locator('.roll svg')
    expect(await svg.getAttribute('viewBox')).toMatch(/^0 0 1000 \d+$/)
    const first = svg.locator('rect.n').first()
    expect(Number(await first.getAttribute('width'))).toBeGreaterThan(100)
    expect(Number(await first.getAttribute('height'))).toBeGreaterThan(5)
})
