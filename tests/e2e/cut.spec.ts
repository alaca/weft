import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\ndrums: stack(\n  s("bd").struct("x ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n  s("oh").struct("~ ~ x ~   ~ ~ x ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n)\n  .bank("RolandTR909")\n\nvox: note("c2 ~ c2 ~")\n  .s("casio")\n\nbass: note("c2 e2")\n  .s("sawtooth")\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)

async function open(page: Page) {
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

test('a sample can be switched to play one at a time, each with a number of its own', async ({ page }) => {
    await open(page)
    await page.getByTestId('strip-vox').getByRole('button', { name: 'Sound controls for vox', exact: true }).click()
    const one = page.getByTestId('strip-vox').getByRole('button', { name: 'One at a time', exact: true })
    await expect(one).toHaveAttribute('aria-pressed', 'false')
    await one.click()
    await expect.poll(() => code(page)).toContain('vox: note("c2 ~ c2 ~")\n  .s("casio")\n  .cut(1)\n')
    await expect(one).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('strip-vox').getByRole('button', { name: 'Sound controls for vox', exact: true }).click()

    await page.getByTestId('strip-drums').getByRole('button', { name: 'Sound controls for oh', exact: true }).click()
    await page.getByTestId('row-panel').getByRole('button', { name: 'One at a time', exact: true }).click()
    await expect.poll(() => code(page)).toContain('  s("oh").struct("~ ~ x ~   ~ ~ x ~   ~ ~ ~ ~   ~ ~ ~ ~").cut(2),\n')
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')

    await page.getByTestId('row-panel').getByRole('button', { name: 'One at a time', exact: true }).click()
    await expect.poll(() => code(page)).not.toContain('.cut(2)')
    expect(await code(page)).toContain('.cut(1)')
})

test('a whole drum kit and a synth have no such switch', async ({ page }) => {
    await open(page)
    await page.getByTestId('strip-drums').getByRole('button', { name: 'Sound controls for drums', exact: true }).click()
    await expect(page.getByTestId('strip-drums').getByTestId('sound-panel')).toBeVisible()
    await expect(page.getByTestId('strip-drums').getByRole('button', { name: 'One at a time', exact: true })).toHaveCount(0)
    await page.getByTestId('strip-bass').getByRole('button', { name: 'Sound controls for bass', exact: true }).click()
    await expect(page.getByTestId('strip-bass').getByTestId('sound-panel')).toBeVisible()
    await expect(page.getByTestId('strip-bass').getByRole('button', { name: 'One at a time', exact: true })).toHaveCount(0)
})
