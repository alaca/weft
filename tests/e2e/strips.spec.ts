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

test('mute writes the underscore into the code and takes the pattern out of what plays', async ({ page }) => {
    await open(page, SONG)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')

    await page.getByTestId('strip-bass').getByRole('button', { name: 'Mute bass' }).click()
    await expect.poll(() => code(page)).toContain('_bass: note(')
    await expect(page.getByTestId('strip-bass')).toHaveClass(/muted/)
    await expect.poll(() => audible(page)).not.toContain('sawtooth')

    await page.getByTestId('strip-bass').getByRole('button', { name: 'Mute bass' }).click()
    await expect.poll(() => code(page)).not.toContain('_bass')
    await expect.poll(() => audible(page)).toContain('sawtooth')
})

test('solo silences the others and leaves the code alone', async ({ page }) => {
    await open(page, SONG)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    const before = await code(page)

    await page.getByTestId('strip-bass').getByRole('button', { name: 'Solo bass' }).click()
    await expect.poll(() => audible(page)).toEqual(['sawtooth'])
    expect(await code(page)).toBe(before)

    await page.getByTestId('strip-bass').getByRole('button', { name: 'Solo bass' }).click()
    await expect.poll(async () => (await audible(page)).length).toBeGreaterThan(1)
})

test('draws read-only piano rolls in pixel-scale units, which WebKit needs to repaint them correctly', async ({ page }) => {
    await open(page, 'keys: n("0 2 4 2").scale("C:major")\n')
    const svg = page.getByTestId('strip-keys').locator('.roll svg')
    expect(await svg.getAttribute('viewBox')).toMatch(/^0 0 1000 \d+$/)
    const first = svg.locator('rect.n').first()
    expect(Number(await first.getAttribute('width'))).toBeGreaterThan(100)
    expect(Number(await first.getAttribute('height'))).toBeGreaterThan(5)
})

// A strip asks its pattern what it plays, and the answer is another one only after the song has
// been played again. A bar lasts a minute here, so that no new bar begins in between.
test('while the song plays a strip draws a change once it is played, and a turned knob asks no pattern again', async ({ page }) => {
    await open(page, 'setcpm(4/4)\n\nkeys: n("0 2 4 2").scale("C:major")\n\nbass: note("d2 ~ d2 f2")\n  .s("sawtooth")\n  .lpf(slider(1200, 200, 4000))\n')
    // How many times a pattern is asked what it plays in the course of each move of a knob.
    await page.evaluate(() => {
        const engine = (window as any).__weft.engine
        const events = engine.events.bind(engine)
        const move = engine.moveSlider.bind(engine)
        let asks = 0
        ;(window as any).__asked = []
        engine.events = (...args: unknown[]) => ((asks += 1), events(...args))
        engine.moveSlider = (...args: unknown[]) => {
            const before = asks
            const moved = move(...args)
            ;(window as any).__asked.push(asks - before)
            return moved
        }
    })
    const notes = page.getByTestId('strip-keys').locator('.roll svg rect.n')
    await expect(notes).toHaveCount(4)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')

    const cutoff = page.getByTestId('strip-bass').getByRole('slider', { name: 'Cutoff' })
    await cutoff.focus()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await expect.poll(async () => Number(await cutoff.getAttribute('aria-valuenow'))).toBeGreaterThan(1238)
    expect(await page.evaluate(() => (window as any).__asked)).toEqual([0, 0])

    await page.evaluate(() => {
        const engine = (window as any).__weft.engine
        const at = engine.getCode().indexOf('0 2 4 2')
        engine.applyEdit({ from: at, to: at + 7, insert: '0 2 4' })
    })
    await page.getByRole('button', { name: /^Update/ }).click()
    await expect(notes).toHaveCount(3)
})
