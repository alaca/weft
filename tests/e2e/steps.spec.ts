import { expect, test, type Page } from '@playwright/test'

const SONG = `setcpm(120/4)

drums: stack(
  s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~").mul(postgain(slider(1, 0, 1.5))).pan(slider(0.5, 0, 1)),
  s("hh").struct("x x x x   x x x x   x x x x   x x x x").mul(postgain(slider(1, 0, 1.5))).pan(slider(0.5, 0, 1)),
)
  .bank("RolandTR909")
`

const hats = async (page: Page) => (await page.evaluate(() => (window as any).__weft.engine.getCode() as string)).split('\n')[4].trim()
const press = async (page: Page, key: string, times: number) => {
    for (let at = 0; at < times; at++) await page.keyboard.press(key)
}

test('each hit of a drum row gets a level, a chance, repeats and a pan of its own, and they are written in the code', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))

    await page.getByRole('button', { name: 'Step by step for hh' }).click()
    // A drag over the bars draws a level for every hit it passes, written once.
    const lane = page.getByRole('group', { name: 'Level of hh, step by step' })
    const box = (await lane.boundingBox())!
    await page.mouse.move(box.x + 6, box.y + box.height - 3)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 6, box.y + 3, { steps: 20 })
    await page.mouse.up()
    const levels = /\.postgain\("([^"]+)"\)/.exec(await hats(page))![1].trim().split(/\s+/).map(Number)
    expect(levels).toHaveLength(16)
    expect(levels[0]).toBeLessThan(0.3)
    expect(levels[15]).toBeGreaterThan(1.2)
    expect([...levels].sort((a, b) => a - b)).toEqual(levels)

    await page.getByRole('button', { name: 'Chance', exact: true }).click()
    await page.getByRole('slider', { name: 'Chance of hh step 2', exact: true }).focus()
    await press(page, 'ArrowDown', 10)
    await page.getByRole('button', { name: 'Repeats', exact: true }).click()
    await page.getByRole('slider', { name: 'Repeats of hh step 16', exact: true }).focus()
    await press(page, 'ArrowUp', 2)
    expect(await hats(page)).toContain('.struct("x x? x x   x x x x   x x x x   x x x x*3")')
    await expect(page.getByRole('button', { name: 'hh step 2', exact: true })).toHaveAttribute('data-chance', '50')
    await expect(page.getByRole('button', { name: 'hh step 16', exact: true })).toHaveAttribute('data-rep', '3')

    // A pan for every step takes the place of the row's knob, and Clear gives the knob back.
    await page.getByRole('button', { name: 'Pan', exact: true }).click()
    await page.getByRole('slider', { name: 'Pan of hh step 1', exact: true }).focus()
    await press(page, 'ArrowDown', 4)
    expect(await hats(page)).toContain('.pan("0.3 0.5 0.5 0.5   0.5 0.5 0.5 0.5   0.5 0.5 0.5 0.5   0.5 0.5 0.5 0.5")')

    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing')
    await expect.poll(async () => Number(await page.getByTestId('cycle').textContent()), { timeout: 20_000 }).toBeGreaterThanOrEqual(2)
    await page.getByRole('button', { name: 'Stop', exact: true }).click()

    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    expect(await hats(page)).toContain('.pan(slider(0.3, 0, 1))')
    // A hit that is taken out is an ordinary step when it is put back.
    await page.getByRole('button', { name: 'hh step 16', exact: true }).click()
    await page.getByRole('button', { name: 'hh step 16', exact: true }).click()
    expect(await hats(page)).toContain('.struct("x x? x x   x x x x   x x x x   x x x x")')
    expect(errors).toEqual([])
})
