import { expect, test, type Page } from '@playwright/test'

const BD = '  s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~")'
const HH = '  s("hh").struct("~ ~ x ~   ~ ~ x ~   ~ ~ x ~   ~ ~ x ~")'
const SONG = `setcpm(120/4)\n\ndrums: stack(\n${BD},\n${HH},\n)\n  .bank("RolandTR909")\n\nbass: note("c2 e2").s("sawtooth")\n`

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
    await expect(volume).toHaveAttribute('aria-valuenow', '1')
    await volume.focus()
    await page.keyboard.press('End')
    await expect.poll(() => code(page)).toContain(`${BD},\n${HH}.mul(postgain(slider(1.5, 0, 1.5))),\n)\n  .bank("RolandTR909")\n`)
    await expect(volume).toBeFocused()
    await page.keyboard.press('PageDown')
    await expect.poll(() => code(page)).toContain(`${HH}.mul(postgain(slider(1.35, 0, 1.5))),\n`)

    await knob(page, 'Pan of bd').focus()
    await page.keyboard.press('Home')
    await expect.poll(() => code(page)).toContain(`${BD}.pan(slider(0, 0, 1)),\n${HH}.mul(postgain(slider(1.35, 0, 1.5))),\n`)
    await expect(knob(page, 'Volume of bd')).toHaveAttribute('aria-valuenow', '1')
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

const mute = (page: Page, sound: string) => page.getByTestId('strip-drums').getByRole('button', { name: `Mute ${sound}`, exact: true })
const heard = (page: Page) => page.evaluate(() => ((window as any).__weft.engine.events('drums', 0) as { sound: string }[]).map((event) => event.sound).sort().join(' '))

test('every sound has a mute button that silences that sound only', async ({ page }) => {
    await open(page)
    await expect.poll(() => heard(page)).toBe('bd bd bd bd hh hh hh hh')
    await expect(mute(page, 'hh')).toHaveAttribute('aria-pressed', 'false')
    await mute(page, 'hh').click()
    await expect.poll(() => code(page)).toContain(`${BD},\n${HH}.hush(),\n)\n  .bank("RolandTR909")\n`)
    await expect(mute(page, 'hh')).toHaveAttribute('aria-pressed', 'true')
    await expect(mute(page, 'bd')).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => heard(page)).toBe('bd bd bd bd')
    await expect(page.getByTestId('strip-drums')).not.toHaveClass(/muted/)

    await mute(page, 'hh').click()
    await expect.poll(() => code(page)).toContain(`${BD},\n${HH},\n)\n`)
    await expect.poll(() => heard(page)).toBe('bd bd bd bd hh hh hh hh')
})
