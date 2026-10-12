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

// The editor draws only the lines that are in sight. A knob whose line is not among them used
// to rewrite the code and play the whole song again at every move, which is heard in a long song.
test('a knob whose line in the code is out of sight is turned without the song being played again', async ({ page }) => {
    await open(page, SONG.replace('\nbass:', `\n${'// \n'.repeat(120)}\nbass:`))
    const inline = page.locator('.cm-line', { hasText: '.lpf(' }).locator('.cm-slider input')
    await expect(inline).toHaveCount(0)
    await page.evaluate(() => {
        const engine = (window as any).__weft.engine
        const edit = engine.applyEdit.bind(engine)
        ;(window as any).__edits = 0
        engine.applyEdit = (...args: unknown[]) => (((window as any).__edits += 1), edit(...args))
    })
    const cutoff = page.getByTestId('strip-bass').getByRole('slider', { name: 'Cutoff' })
    await cutoff.focus()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await expect(cutoff).not.toHaveAttribute('aria-valuenow', '1200')
    const now = Number(await cutoff.getAttribute('aria-valuenow'))
    expect(now).toBeGreaterThan(1238)
    await expect.poll(() => code(page)).toContain(`slider(${now}, 200, 4000)`)
    expect(await page.evaluate(() => (window as any).__edits)).toBe(0)
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')

    // Scrolled into sight, the slider in the code stands where the knob was turned to, and
    // moving it changes the same number.
    await page.locator('.cm-scroller').evaluate((scroller) => (scroller.scrollTop = scroller.scrollHeight))
    await expect.poll(async () => Math.abs(Number(await inline.inputValue()) - now)).toBeLessThan(4)
    await inline.evaluate((slider: HTMLInputElement) => {
        slider.value = '2000'
        slider.dispatchEvent(new Event('input', { bubbles: true }))
    })
    // The slider in the code moves in steps of its own, so it lands near what it was given.
    await expect.poll(async () => Math.abs(Number(/\.lpf\(slider\(([\d.]+), 200, 4000\)\)/.exec(await code(page))?.[1]) - 2000)).toBeLessThan(4)
})

test('pressing a faint knob adds its line, and removing it takes the line away', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    await bass.getByRole('button', { name: 'Sound controls for bass' }).click()
    await bass.getByRole('button', { name: 'Add Delay' }).click()
    await expect.poll(() => code(page)).toContain('  .pan(sine.slow(4))\n  .delay(slider(0.25, 0, 1))\n')
    const delay = bass.getByRole('slider', { name: 'Delay' })
    await expect(delay).toHaveAttribute('aria-valuenow', '0.25')

    await delay.hover()
    await bass.getByRole('button', { name: 'Remove Delay' }).click()
    await expect.poll(() => code(page)).not.toContain('.delay(')
    await expect(bass.getByRole('button', { name: 'Add Delay' })).toBeVisible()
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
