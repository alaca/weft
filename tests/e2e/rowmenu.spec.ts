import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\ndrums: stack(\n  s("bd").struct("x ~ ~ ~   ~ ~ ~ ~   x ~ ~ ~   ~ ~ ~ ~"),\n  s("sd").struct("~ ~ ~ ~   x ~ ~ ~   ~ ~ ~ ~   x ~ ~ ~"),\n)\n  .bank("RolandTR909")\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const hits = async (page: Page, sound: string) => {
    const pads = page.getByTestId('strip-drums').getByRole('button', { name: new RegExp(`^${sound} step \\d+$`) })
    const pressed = await pads.evaluateAll((all) => all.map((pad) => pad.getAttribute('aria-pressed') === 'true'))
    return pressed.flatMap((on, at) => (on ? [at + 1] : []))
}

test('a right click on a sound opens what can be done with its row', async ({ page }) => {
    await page.addInitScript((text) => localStorage.setItem('weft.song', text), SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    const drums = page.getByTestId('strip-drums')
    const menuOf = async (sound: string) => {
        await drums.getByRole('button', { name: `Hear ${sound}`, exact: true }).click({ button: 'right' })
        const menu = page.getByRole('menu', { name: `What to do with ${sound}` })
        await expect(menu).toBeVisible()
        return menu
    }

    let menu = await menuOf('bd')
    await menu.getByRole('menuitem', { name: 'Fill each 4 steps' }).click()
    await expect(menu).toHaveCount(0)
    await expect.poll(() => hits(page, 'bd')).toEqual([1, 5, 9, 13])
    menu = await menuOf('bd')
    await menu.getByRole('menuitem', { name: 'Rotate right' }).click()
    await expect.poll(() => hits(page, 'bd')).toEqual([2, 6, 10, 14])
    await menu.getByRole('menuitem', { name: 'Copy' }).click()

    // Pasted onto another row, it takes the place of that row's hits.
    menu = await menuOf('sd')
    await menu.getByRole('menuitem', { name: 'Paste' }).click()
    await expect.poll(() => hits(page, 'sd')).toEqual([2, 6, 10, 14])

    // Another sound keeps the row's hits; cutting itself is written on the row.
    menu = await menuOf('sd')
    await menu.getByRole('menuitem', { name: 'Replace with' }).click()
    await menu.getByRole('menuitem', { name: /^Clap/ }).click()
    await expect.poll(() => code(page)).toContain('s("cp")')
    expect(await code(page)).not.toContain('s("sd")')
    await expect.poll(() => hits(page, 'cp')).toEqual([2, 6, 10, 14])
    menu = await menuOf('bd')
    await menu.getByRole('menuitemcheckbox', { name: 'Cut itself' }).click()
    await expect.poll(() => code(page)).toMatch(/s\("bd"\)[^\n]*\.cut\(1\)/)

    menu = await menuOf('cp')
    await menu.getByRole('menuitem', { name: 'Remove' }).click()
    await expect.poll(() => code(page)).not.toContain('s("cp")')
})
