import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\ndrums: stack(\n  s("bd").struct("x ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n)\n  .bank("RolandTR909")\n\nbass: note(`\n  c2 ~  ~  ~\n`)\n  .s("sawtooth")\n  .lpf(slider(800, 100, 8000))\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function open(page: Page) {
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

test('a click in a grid is undone and done again from the keyboard, with the focus anywhere in the controls', async ({ page }) => {
    await open(page)
    const drums = page.getByTestId('strip-drums')
    await drums.getByRole('button', { name: 'bd step 5', exact: true }).click()
    await drums.getByRole('button', { name: 'bd step 9', exact: true }).click()
    await expect.poll(() => code(page)).toContain('s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   ~ ~ ~ ~")')

    await page.keyboard.press(`${MOD}+z`)
    await expect.poll(() => code(page)).toContain('s("bd").struct("x ~ ~ ~   x ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~")')
    await expect(drums.getByRole('button', { name: 'bd step 9', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await page.keyboard.press(`${MOD}+z`)
    await expect.poll(() => code(page)).toBe(SONG)

    await page.keyboard.press(`${MOD}+Shift+z`)
    await expect.poll(() => code(page)).toContain('s("bd").struct("x ~ ~ ~   x ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~")')
    await page.keyboard.press(`${MOD}+y`)
    await expect.poll(() => code(page)).toContain('s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   ~ ~ ~ ~")')
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
})

test('nothing of another song comes back when a song has just been opened', async ({ page }) => {
    await open(page)
    await page.getByTestId('strip-drums').getByRole('button', { name: 'bd step 5', exact: true }).click()
    await page.getByTestId('top').getByRole('button', { name: 'New song', exact: true }).click()
    await expect.poll(() => code(page)).toBe('setcpm(120/4)\n')
    await page.getByTestId('status').click()
    await page.keyboard.press(`${MOD}+z`)
    await page.keyboard.press(`${MOD}+z`)
    expect(await code(page)).toBe('setcpm(120/4)\n')
})

test('a knob that was dragged is undone in one step', async ({ page }) => {
    await open(page)
    const volume = page.getByTestId('strip-drums').getByRole('slider', { name: 'Volume of drums', exact: true })
    const box = (await volume.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 15, { steps: 3 })
    // A hand that rests while it listens is still on the same drag. The rest here is longer
    // than the half second within which the editor joins changes by itself.
    await page.waitForTimeout(700)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 30, { steps: 3 })
    await page.mouse.up()
    await expect.poll(() => code(page)).toMatch(/\.mul\(postgain\(slider\(0\.7\d?, 0, 1\.5\)\)\)/)
    await page.getByTestId('status').click()
    await page.keyboard.press(`${MOD}+z`)
    await expect.poll(() => code(page)).toBe(SONG)
})
