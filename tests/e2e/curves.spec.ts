import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(240/4)\n\nbass: note("c2 c2 c2 c2")\n  .s("sawtooth")\n  .lpf(slider(1200, 100, 8000))\n  .mul(postgain(0.8))\n  .mask("<1!4>")\n\nhats: s("hh*8")\n  .bank("RolandTR909")\n  .mask("<1!4>")\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const lane = (page: Page, id: string, fn: string) => page.getByTestId(`curve-${id}-${fn}`)
const bar = (page: Page, name: string, at: number) => page.getByRole('slider', { name: `${name} in bar ${at}`, exact: true })

async function open(page: Page, song = SONG) {
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), song)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
}

async function draw(page: Page, id: string, label: string) {
    await page.getByRole('button', { name: `Draw a knob of ${id} over the song`, exact: true }).click()
    await page.getByRole('menu', { name: `Knobs of ${id}` }).getByRole('menuitem', { name: label, exact: true }).click()
}

// How loud each bar of the song is, made the way a file of it is made.
const loudness = (page: Page, bars: number) =>
    page.evaluate(async (count) => {
        const made = await (window as any).__weft.engine.render({ bars: count, ringSeconds: 0, sampleRate: 22050 })
        const left: Float32Array = made.channels[0]
        const perBar = Math.round(made.secondsPerBar * made.sampleRate)
        return Array.from({ length: count }, (_, at) => {
            let sum = 0
            for (let frame = at * perBar; frame < (at + 1) * perBar; frame++) sum += left[frame] * left[frame]
            return Math.sqrt(sum / perBar)
        })
    }, bars)

test('a knob is drawn over the song bar by bar, in the code and in what is heard, and stands still again', async ({ page }) => {
    await open(page)
    await expect(page.getByRole('button', { name: 'Draw a knob of hats over the song', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Draw a knob of bass over the song', exact: true }).click()
    await expect(page.getByRole('menu', { name: 'Knobs of bass' }).getByRole('menuitem')).toHaveText(['Cutoff', 'Volume'])
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu', { name: 'Knobs of bass' })).toHaveCount(0)

    await draw(page, 'bass', 'Volume')
    await expect.poll(() => code(page)).toContain('  .mul(postgain("<0.8!4>"))\n')
    await expect(lane(page, 'bass', 'volume')).toBeVisible()
    await expect(page.getByTestId('curve-name-bass-volume')).toHaveText('Volume')

    // A bar is set from the keyboard, like a knob.
    await bar(page, 'bass Volume', 2).focus()
    await page.keyboard.press('Home')
    await expect.poll(() => code(page)).toContain('.mul(postgain("<0.8 0 0.8!2>"))')
    await bar(page, 'bass Volume', 4).focus()
    await page.keyboard.press('End')
    await expect.poll(() => code(page)).toContain('.mul(postgain("<0.8 0 0.8 1.5>"))')
    await expect(bar(page, 'bass Volume', 4)).toHaveAttribute('aria-valuenow', '1.5')

    // The song is as the drawing says: nothing of the bass in the second bar, the most in the fourth.
    await page.getByTestId('strip-hats').getByRole('button', { name: 'Mute hats', exact: true }).click()
    const heard = await loudness(page, 4)
    expect(heard[0]).toBeGreaterThan(0.02)
    expect(heard[1]).toBeLessThan(heard[0] * 0.2)
    expect(heard[3]).toBeGreaterThan(heard[0] * 1.5)

    // In its panel the knob says where it is drawn, and it is put back from there or from the song.
    const strip = page.getByTestId('strip-bass')
    await strip.getByRole('button', { name: 'Sound controls for bass', exact: true }).click()
    await draw(page, 'bass', 'Cutoff')
    await expect.poll(() => code(page)).toContain('.lpf("<1200!4>")')
    await strip.getByRole('button', { name: 'Cutoff is drawn over the song', exact: true }).click()
    await strip.getByRole('dialog', { name: 'Cutoff over the song' }).getByRole('button', { name: 'Stand still again', exact: true }).click()
    await expect.poll(() => code(page)).toContain('.lpf(slider(1200, 100, 8000))')
    await expect(lane(page, 'bass', 'lpf')).toHaveCount(0)
    await page.getByTestId('curve-name-bass-volume').hover()
    await page.getByRole('button', { name: 'Let Volume of bass stand still again', exact: true }).click()
    await expect.poll(() => code(page)).toContain('.mul(postgain(slider(0.8, 0, 1.5)))')
    await expect(lane(page, 'bass', 'volume')).toHaveCount(0)
})

test('dragging draws bar by bar, and with Shift held a straight line from where the drag began', async ({ page }) => {
    await open(page)
    await draw(page, 'bass', 'Volume')
    const box = (await lane(page, 'bass', 'volume').boundingBox())!
    const wide = (await bar(page, 'bass Volume', 1).boundingBox())!.width
    const x = (at: number) => box.x + (at - 0.5) * wide
    const top = box.y + 3
    const bottom = box.y + box.height - 3

    // Free: every bar the pointer passes gets the height the pointer is at there.
    await page.mouse.move(x(1), bottom)
    await page.mouse.down()
    await page.mouse.move(x(3), bottom, { steps: 4 })
    await page.mouse.move(x(3), top, { steps: 3 })
    await page.mouse.move(x(4), top, { steps: 3 })
    await page.mouse.up()
    await expect.poll(() => code(page)).toContain('.mul(postgain("<0!2 1.5!2>"))')

    // With Shift: a line from the first bar to the last, whatever was there.
    await page.mouse.move(x(1), bottom)
    await page.keyboard.down('Shift')
    await page.mouse.down()
    await page.mouse.move(x(4), top, { steps: 4 })
    await page.mouse.up()
    await page.keyboard.up('Shift')
    await expect.poll(() => code(page)).toContain('.mul(postgain("<0 0.5 1 1.5>"))')
})

test('a knob that is turned while the song plays is drawn over the song when it stops', async ({ page }) => {
    await open(page)
    await page.getByTestId('strip-bass').getByRole('button', { name: 'Sound controls for bass', exact: true }).click()
    const cutoff = page.getByTestId('strip-bass').getByRole('slider', { name: 'Cutoff', exact: true })
    await page.getByRole('button', { name: 'Record knobs', exact: true }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing')
    await expect.poll(() => page.evaluate(() => (window as any).__weft.engine.now() as number)).toBeGreaterThan(0.1)
    await cutoff.focus()
    await page.keyboard.press('End')
    await expect.poll(() => page.evaluate(() => Math.floor((window as any).__weft.engine.now()) % 4)).toBe(2)
    await page.keyboard.press('Home')
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    // Where it was turned up it is up, from where it was turned down it is down, to the end.
    await expect.poll(() => code(page)).toMatch(/\.lpf\("<(1200 )?8000(!\d)? 100!2>"\)/)
    await expect(lane(page, 'bass', 'lpf')).toBeVisible()
    await expect(bar(page, 'bass Cutoff', 4)).toHaveAttribute('aria-valuenow', '100')
})

