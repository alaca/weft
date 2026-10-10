import { expect, test, type Page } from '@playwright/test'

const BD = '  s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~")'
const HH = '  s("hh").struct("~ ~ x ~   ~ ~ x ~   ~ ~ x ~   ~ ~ x ~")'
const SONG = `setcpm(120/4)\n\ndrums: stack(\n${BD},\n${HH},\n)\n  .bank("RolandTR909")\n\nbass: note("c2 e2").s("sawtooth")\n`
const OLDER = 'setcpm(120/4)\n\ndrums: s("bd*4, hh*8").bank("RolandTR909")\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const knob = (page: Page, name: string) => page.getByTestId('strip-drums').getByRole('slider', { name, exact: true })
const soundButton = (page: Page, sound: string) => page.getByTestId('strip-drums').getByRole('button', { name: `Sound controls for ${sound}`, exact: true })
const panel = (page: Page) => page.getByTestId('row-panel')

async function open(page: Page, song = SONG) {
    await page.addInitScript((text) => localStorage.setItem('weft.song', text), song)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

test('every sound of a kit has its own volume and pan, written on its own line', async ({ page }) => {
    await open(page)
    const volume = knob(page, 'Volume of hh')
    await expect(volume).toHaveAttribute('aria-valuenow', '0.8')
    await volume.focus()
    await page.keyboard.press('End')
    await expect.poll(() => code(page)).toContain(`${BD},\n${HH}.gain(slider(1.5, 0, 1.5)),\n)\n  .bank("RolandTR909")\n`)
    await expect(volume).toBeFocused()
    await page.keyboard.press('PageDown')
    await expect.poll(() => code(page)).toContain(`${HH}.gain(slider(1.35, 0, 1.5)),\n`)

    await knob(page, 'Pan of bd').focus()
    await page.keyboard.press('Home')
    await expect.poll(() => code(page)).toContain(`${BD}.pan(slider(0, 0, 1)),\n${HH}.gain(slider(1.35, 0, 1.5)),\n`)
    await expect(knob(page, 'Volume of bd')).toHaveAttribute('aria-valuenow', '0.8')
})

test('the volume of the whole kit stays apart from the volume of one sound', async ({ page }) => {
    await open(page)
    await knob(page, 'Volume of drums').focus()
    await page.keyboard.press('End')
    await expect.poll(() => code(page)).toContain(`${BD},\n${HH},\n)\n  .bank("RolandTR909")\n  .gain(slider(1.5, 0, 1.5))\n`)
    await expect(knob(page, 'Volume of hh')).toHaveAttribute('aria-valuenow', '0.8')
})

test('one sound has its own panel of controls', async ({ page }) => {
    await open(page)
    await soundButton(page, 'hh').click()
    await expect(soundButton(page, 'hh')).toHaveAttribute('aria-pressed', 'true')
    await expect(panel(page)).toContainText('These controls are for Closed hat hh only.')
    await panel(page).getByRole('button', { name: 'Add Cutoff' }).click()
    await expect.poll(() => code(page)).toContain(`${BD},\n${HH}.lpf(slider(1200, 100, 8000)),\n`)

    await panel(page).getByRole('button', { name: 'High pass' }).click()
    await expect.poll(() => code(page)).toContain(`${HH}.hpf(slider(1200, 100, 8000)),\n`)

    await panel(page).getByRole('button', { name: 'Browse all controls' }).click()
    await panel(page).getByRole('searchbox', { name: 'Search controls' }).fill('crush')
    await panel(page).getByRole('button', { name: /Crush/ }).click()
    await expect.poll(() => code(page)).toContain(`${HH}.hpf(slider(1200, 100, 8000)).crush(slider(8, 1, 16)),\n`)

    const cut = panel(page).getByRole('slider', { name: 'Low cut' })
    await cut.hover()
    await panel(page).getByRole('button', { name: 'Remove Low cut' }).click()
    await expect.poll(() => code(page)).toContain(`${BD},\n${HH}.crush(slider(8, 1, 16)),\n`)

    await soundButton(page, 'hh').click()
    await expect(panel(page)).toHaveCount(0)
})

test('the panel of one sound and the panel of the whole kit are never open together', async ({ page }) => {
    await open(page)
    const kit = page.getByTestId('sound-panel')
    await soundButton(page, 'bd').click()
    await expect(panel(page)).toContainText('Kick')
    await soundButton(page, 'hh').click()
    await expect(panel(page)).toContainText('Closed hat')
    await expect(panel(page)).toHaveCount(1)
    await page.getByRole('button', { name: 'Sound controls for drums', exact: true }).click()
    await expect(panel(page)).toHaveCount(0)
    await kit.getByRole('button', { name: 'Add Room' }).click()
    await expect.poll(() => code(page)).toContain(`${HH},\n)\n  .bank("RolandTR909")\n  .room(slider(0.3, 0, 1))\n`)
})

test('the grid stays in sight and the other strips fold while a sound has its panel open', async ({ page }) => {
    await open(page)
    await soundButton(page, 'bd').click()
    await expect(page.getByTestId('strip-drums').locator('.dg')).toHaveCount(1)
    await expect(page.getByTestId('strip-drums')).toHaveClass(/sel/)
    await expect(page.getByTestId('strip-bass').locator('.st-b')).toHaveCount(0)
})

test('steps can be changed while a sound has controls, and the controls stay', async ({ page }) => {
    await open(page)
    await knob(page, 'Volume of hh').focus()
    await page.keyboard.press('End')
    await page.getByTestId('strip-drums').getByRole('button', { name: 'hh step 1', exact: true }).click()
    await expect.poll(() => code(page)).toContain('  s("hh").struct("x ~ x ~   ~ ~ x ~   ~ ~ x ~   ~ ~ x ~").gain(slider(1.5, 0, 1.5)),\n')
    await page.getByTestId('strip-drums').getByRole('button', { name: 'Length 2 cycles' }).click()
    await expect.poll(() => code(page)).toContain('~ ~ x ~   x ~ x ~   ~ ~ x ~   ~ ~ x ~   ~ ~ x ~").gain(slider(1.5, 0, 1.5)),\n).slow(2)\n')
    await expect(knob(page, 'Volume of hh')).toHaveAttribute('aria-valuenow', '1.5')
})

test('removing a sound takes its controls with it and closes its panel', async ({ page }) => {
    await open(page)
    await soundButton(page, 'hh').click()
    await panel(page).getByRole('button', { name: 'Add Cutoff' }).click()
    await expect.poll(() => code(page)).toContain('.lpf(')
    const drums = page.getByTestId('strip-drums')
    await drums.getByRole('button', { name: 'Hear hh' }).hover()
    await drums.getByRole('button', { name: 'Remove hh' }).click()
    await expect.poll(() => code(page)).toContain(`drums: stack(\n${BD},\n)\n  .bank("RolandTR909")\n`)
    await expect(panel(page)).toHaveCount(0)
    await expect(page.getByTestId('strip-bass').locator('.st-b')).toHaveCount(1)
})

test('a kit written the older way is rewritten the first time one sound gets a control', async ({ page }) => {
    await open(page, OLDER)
    await expect(knob(page, 'Volume of hh')).toHaveAttribute('aria-valuenow', '0.8')
    await knob(page, 'Volume of hh').focus()
    await page.keyboard.press('End')
    await expect
        .poll(() => code(page))
        .toBe('setcpm(120/4)\n\ndrums: stack(\n  s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~"),\n  s("hh").struct("x ~ x ~   x ~ x ~   x ~ x ~   x ~ x ~").gain(slider(1.5, 0, 1.5)),\n).bank("RolandTR909")\n')
})

test('a kit written the older way is rewritten when the panel of one sound is opened', async ({ page }) => {
    await open(page, OLDER)
    await soundButton(page, 'bd').click()
    await expect(panel(page)).toContainText('These controls are for Kick bd only.')
    await expect.poll(() => code(page)).toContain('drums: stack(\n  s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~"),\n')
})

test('the controls of a sound are disabled while the code has an error', async ({ page }) => {
    await open(page)
    await page.evaluate(() => (window as any).__weft.engine.applyEdit({ from: 0, to: 0, insert: 'broken: s("bd"\n' }))
    await expect(knob(page, 'Volume of hh')).toHaveAttribute('aria-disabled', 'true')
    await expect(soundButton(page, 'hh')).toBeDisabled()
})
