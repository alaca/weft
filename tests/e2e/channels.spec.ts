import { expect, test, type Page } from '@playwright/test'

const SONG = `setcpm(120/4)

drums: stack(
  s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~"),
  s("hh").struct("~ ~ x ~   ~ ~ x ~   ~ ~ x ~   ~ ~ x ~"),
)
  .bank("RolandTR909")

bass: note("c2 e2 g2 e2")
  .s("sawtooth")
  .lpf(slider(900, 100, 8000))

_lead: note("c4 e4")
  .s("triangle")
`

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const sounds = (page: Page, id: string) => page.getByTestId(`mix-${id}`).locator('.vu-b')

test('the song panel shows the patterns as the strips of a mixer, with a meter each, and what is turned there is written in the code', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready')

    const panel = page.getByTestId('song')
    await panel.getByRole('button', { name: 'Mix', exact: true }).click()
    await expect(page.getByTestId('mix-strips').locator('.ms-s')).toHaveCount(3)
    await expect(page.getByTestId('song-scroll')).toBeHidden()

    // While the song plays, the meter of a pattern that sounds moves and that of a muted one does not.
    await page.getByRole('button', { name: 'Live', exact: true }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(sounds(page, 'drums')).toHaveAttribute('data-sounds', 'yes')
    await expect(sounds(page, 'bass')).toHaveAttribute('data-sounds', 'yes')
    await expect(sounds(page, 'lead')).toHaveAttribute('data-sounds', 'no')
    await page.getByTestId('mix-bass').getByRole('button', { name: 'Mute bass', exact: true }).click()
    await expect(sounds(page, 'bass')).toHaveAttribute('data-sounds', 'no')
    await expect(sounds(page, 'drums')).toHaveAttribute('data-sounds', 'yes')
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await page.getByTestId('mix-bass').getByRole('button', { name: 'Mute bass', exact: true }).click()

    // The fader is the pattern's volume, and a faint knob adds its line as it does anywhere else.
    await page.getByTestId('mix-drums').getByRole('slider', { name: 'Volume of drums', exact: true }).focus()
    await page.keyboard.press('PageDown')
    expect(await code(page)).toMatch(/\.bank\("RolandTR909"\)\n\s+\.mul\(postgain\(slider\(0\.\d+, 0, 1\.5\)\)\)/)
    await page.getByTestId('mix-bass').getByRole('slider', { name: 'Low cut of bass', exact: true }).focus()
    await page.keyboard.press('ArrowUp')
    expect(await code(page)).toMatch(/\.lpf\(slider\(900, 100, 8000\)\)\n  \.hpf\(slider\(\d+, 20, 4000\)\)/)
    await page.getByTestId('mix-bass').getByRole('slider', { name: 'Room of bass', exact: true }).focus()
    await page.keyboard.press('ArrowUp')
    expect(await code(page)).toMatch(/\.room\(slider\(0\.\d+, 0, 1\)\)/)

    // Back to the bars, the meters are no longer worked out.
    await panel.getByRole('button', { name: 'Bars', exact: true }).click()
    await expect(page.getByTestId('song-scroll')).toBeVisible()
    await expect(page.getByTestId('mix-strips')).toHaveCount(0)
    expect(errors).toEqual([])
})
