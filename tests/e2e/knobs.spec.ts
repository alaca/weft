import { expect, test, type Page } from '@playwright/test'

const SONG = `setcpm(120/4)

drums: s("bd*4, hh*8")
  .bank("RolandTR909")
  .degradeBy(slider(0.2, 0, 1))

bass: note("d2 ~ d2 f2")
  .s("sawtooth")
  .lpf(slider(1200, 200, 4000))
  .lpq(8)
  .pan(sine.slow(4))
`

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)

async function open(page: Page, song = SONG) {
    await page.addInitScript((text) => localStorage.setItem('weft.song', text), song)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

test('shows a knob for each number in the code', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    await expect(bass.getByRole('slider', { name: 'Cutoff' })).toHaveAttribute('aria-valuenow', '1200')
    await expect(bass.getByRole('slider', { name: 'Cutoff' })).toHaveAttribute('aria-valuetext', '1200 Hz')
    await expect(bass.getByRole('slider', { name: 'Resonance' })).toHaveAttribute('aria-valuenow', '8')
    await expect(bass.locator('.kn.locked')).toContainText('in code')
    await expect(bass.locator('.kn.locked')).toContainText('Pan')
    await expect(page.getByTestId('strip-drums').getByRole('slider', { name: 'Skip hits' })).toHaveAttribute('aria-valuenow', '0.2')
})

test('turning a slider knob rewrites its number and the code stays in step', async ({ page }) => {
    await open(page)
    const cutoff = page.getByTestId('strip-bass').getByRole('slider', { name: 'Cutoff' })
    await cutoff.focus()
    await page.keyboard.press('ArrowUp')
    await expect.poll(() => code(page)).toContain('slider(1238, 200, 4000)')
    await expect(cutoff).toHaveAttribute('aria-valuenow', '1238')
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
    const inline = page.locator('.cm-line', { hasText: '.lpf(' }).locator('.cm-slider input')
    await expect.poll(async () => Math.abs(Number(await inline.inputValue()) - 1238)).toBeLessThan(4)
})

test('turning a plain-number knob rewrites the number and plays it', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Play' }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    const resonance = page.getByTestId('strip-bass').getByRole('slider', { name: 'Resonance' })
    await resonance.focus()
    await page.keyboard.press('ArrowUp')
    await expect.poll(() => code(page)).toContain('.lpq(8.3)')
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
})

test('dragging a knob upwards raises its value', async ({ page }) => {
    await open(page)
    const cutoff = page.getByTestId('strip-bass').getByRole('slider', { name: 'Cutoff' })
    const box = (await cutoff.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 90, { steps: 5 })
    await page.mouse.up()
    await expect.poll(async () => Number(await cutoff.getAttribute('aria-valuenow'))).toBeGreaterThan(2900)
})

test('the sound panel has four groups with faint knobs for what is not in the code', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    await bass.getByRole('button', { name: 'Sound controls for bass' }).click()
    await expect(bass.locator('.sp h4')).toHaveText(['Source', 'Filter', 'Shape', 'Effects'])
    await expect(bass.getByRole('slider', { name: 'Cutoff' })).toHaveCount(1)
    await expect(bass.getByRole('button', { name: 'Add Sweep' })).toBeVisible()
    await expect(bass.getByRole('button', { name: 'Add Delay' })).toBeVisible()
    await expect(bass.getByRole('button', { name: 'Add Vibrato' })).toBeVisible()
    await bass.getByRole('button', { name: 'Sound controls for bass' }).click()
    await expect(bass.locator('.sp')).toHaveCount(0)
})

test('pressing a faint knob adds its line, and removing it takes the line away', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    await bass.getByRole('button', { name: 'Sound controls for bass' }).click()
    await bass.getByRole('button', { name: 'Add Delay' }).click()
    await expect.poll(() => code(page)).toContain('  .pan(sine.slow(4))\n  .delay(slider(0.25, 0, 1))\n')
    await expect(bass).toContainText('lines 7 to 12')
    const delay = bass.getByRole('slider', { name: 'Delay' })
    await expect(delay).toHaveAttribute('aria-valuenow', '0.25')

    await delay.hover()
    await bass.getByRole('button', { name: 'Remove Delay' }).click()
    await expect.poll(() => code(page)).not.toContain('.delay(')
    await expect(bass.getByRole('button', { name: 'Add Delay' })).toBeVisible()
})

test('a synth has the three knobs that make a bell: metal, its ratio and its fade', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    await bass.getByRole('button', { name: 'Sound controls for bass' }).click()
    await expect(bass.getByRole('button', { name: 'Add Metal ratio', exact: true })).toHaveCount(0)
    await bass.getByRole('button', { name: 'Add Metal', exact: true }).click()
    await bass.getByRole('button', { name: 'Add Metal ratio', exact: true }).click()
    await bass.getByRole('button', { name: 'Add Metal fade', exact: true }).click()
    await expect.poll(() => code(page)).toContain('  .fm(slider(2, 0, 8))\n  .fmh(slider(2, 0.5, 8))\n  .fmdecay(slider(0.3, 0, 2))\n')
    await expect(bass.getByRole('slider', { name: 'Metal fade' })).toHaveAttribute('aria-valuenow', '0.3')
    await expect(page.getByTestId('code-status')).not.toContainText('rror')

    const drums = page.getByTestId('strip-drums')
    await drums.getByRole('button', { name: 'Sound controls for drums' }).click()
    await expect(drums.getByRole('button', { name: 'Add Speed' })).toBeVisible()
    await expect(drums.getByRole('button', { name: 'Add Metal', exact: true })).toHaveCount(0)
})

test('every strip has a volume knob that writes gain into the code when it is first turned', async ({ page }) => {
    await open(page)
    const volume = page.getByTestId('strip-drums').getByRole('slider', { name: 'Volume of drums', exact: true })
    await expect(volume).toHaveAttribute('aria-valuenow', '0.8')
    await expect.poll(() => code(page)).not.toContain('.gain(')
    await volume.focus()
    await page.keyboard.press('End')
    await expect.poll(() => code(page)).toContain('.gain(slider(1.5, 0, 1.5))')
    await expect(volume).toBeFocused()
    await page.keyboard.press('PageDown')
    await expect.poll(() => code(page)).toContain('.gain(slider(1.35, 0, 1.5))')
    await expect(volume).toHaveAttribute('aria-valuenow', '1.35')
})

test('every strip has a pan knob that starts in the middle', async ({ page }) => {
    await open(page)
    const drums = page.getByTestId('strip-drums')
    const pan = drums.getByRole('slider', { name: 'Pan of drums', exact: true })
    await expect(pan).toHaveAttribute('aria-valuenow', '0.5')
    await pan.focus()
    await page.keyboard.press('Home')
    await expect.poll(() => code(page)).toContain('.pan(slider(0, 0, 1))')
    await expect(pan).toHaveAttribute('aria-valuenow', '0')
    await expect(drums.locator('.st-r').getByRole('slider', { name: /^Pan/ })).toHaveCount(0)
})

test('volume and pan can be dragged', async ({ page }) => {
    await open(page)
    const volume = page.getByTestId('strip-drums').getByRole('slider', { name: 'Volume of drums', exact: true })
    const box = (await volume.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 30, { steps: 5 })
    await page.mouse.up()
    await expect.poll(() => code(page)).toMatch(/\.gain\(slider\(0\.5\d?, 0, 1\.5\)\)/)
})

test('a strip with nothing else to turn still has volume and pan, also when it is muted', async ({ page }) => {
    await open(page, 'setcpm(120/4)\n\nlead: note("c4 e4")\n')
    const lead = page.getByTestId('strip-lead')
    await expect(lead.getByRole('slider')).toHaveCount(2)
    await page.getByRole('button', { name: 'Mute lead', exact: true }).click()
    await expect(lead.getByRole('slider', { name: 'Volume of lead', exact: true })).toBeVisible()
})

test('knobs are disabled while the code does not parse', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    await bass.getByRole('button', { name: 'Sound controls for bass' }).click()
    await page.evaluate(() => (window as any).__weft.engine.applyEdit({ from: 0, to: 0, insert: 'broken: s("bd"\n' }))
    await expect(bass.getByRole('button', { name: 'Add Delay' })).toBeDisabled()
    await expect(bass.getByRole('slider', { name: 'Cutoff' })).toHaveAttribute('aria-disabled', 'true')
})
