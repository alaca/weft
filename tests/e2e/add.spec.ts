import { expect, test, type Locator, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n'
const NONE = '~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~'
// A pattern that is added is in none of the sixteen bars of a song that has no length of its own yet.
const NOWHERE = '  .mask("<0!16>")\n'
// A sound that is made has how loud it is and where it sits written after it: in a kit on its
// own line, and at the end of a pattern of notes.
const MIX = '.mul(postgain(slider(1, 0, 1.5))).pan(slider(0.5, 0, 1))'
const MIX_LINES = '  .mul(postgain(slider(1, 0, 1.5)))\n  .pan(slider(0.5, 0, 1))\n'
const CLEAN_DRUMS = (name: string) =>
    `${name}: stack(\n${['bd', 'sd', 'cp', 'hh'].map((sound) => `  s("${sound}").struct("${NONE}")${MIX},\n`).join('')})\n  .bank("RolandTR909")\n${NOWHERE}`

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const chip = (page: Page, name: string) => page.getByTestId('add-pattern').getByRole('button', { name, exact: true })
const step = (strip: Locator, sound: string, at: number) => strip.getByRole('button', { name: `${sound} step ${at}`, exact: true })
const lit = (strip: Locator) => strip.locator('.dg').getByRole('button', { pressed: true })

async function open(page: Page, song = SONG) {
    await page.addInitScript((text) => localStorage.setItem('weft.song', text), song)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

test('adds drums under a free name, with empty rows ready to click', async ({ page }) => {
    await open(page)
    await chip(page, 'Drums').click()
    await expect.poll(() => code(page)).toBe(`${SONG}\n${CLEAN_DRUMS('drums2')}`)
    const strip = page.getByTestId('strip-drums2')
    await expect(strip).toHaveClass(/sel/)
    await expect(strip.locator('.rn')).toHaveText(['bd', 'sd', 'cp', 'hh'])
    await expect(lit(strip)).toHaveCount(0)
    await step(strip, 'bd', 1).click()
    await expect.poll(() => code(page)).toContain(`drums2: stack(\n  s("bd").struct("x ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~")${MIX},\n  s("sd")`)
    await expect(strip.locator('.rn')).toHaveText(['bd', 'sd', 'cp', 'hh'])
})

test('adds a bass line: an empty roll in the low notes, with a knob to turn', async ({ page }) => {
    await open(page)
    await chip(page, 'Bass line').click()
    const strip = page.getByTestId('strip-bass')
    await expect.poll(() => code(page)).toBe(`${SONG}\nbass: note("~")\n  .s("sawtooth")\n  .lpf(slider(900, 100, 8000))\n${MIX_LINES}${NOWHERE}`)
    await expect(strip.locator('.nt')).toHaveCount(0)
    await expect(strip.locator('.nr-g')).toHaveAttribute('data-low', '28')
    await expect(strip.locator('.nr-g')).toHaveAttribute('data-high', '45')
    await expect(strip.getByRole('slider', { name: 'Cutoff' })).toBeVisible()
})

test('starts a song from nothing', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await open(page, '')
    await expect(page.getByTestId('controls')).toContainText('You can also add one below')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
    expect(errors).toEqual([])
    await chip(page, 'Melody').click()
    await expect.poll(() => code(page)).toBe(`melody: note("~")\n  .s("triangle")\n  .delay(slider(0.25, 0, 1))\n${MIX_LINES}${NOWHERE}`)
    await expect(page.getByTestId('strip-melody')).toBeVisible()
    await expect(page.getByTestId('controls')).not.toContainText('Give a pattern a name')
})

test('a pattern added to a song that has been arranged is in none of its bars', async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), 'setcpm(120/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n  .mask("<1!4 0!4>")\n\nbass: note("c2 e2")\n  .s("sawtooth")\n')
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    const code = () => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
    await page.getByTestId('add-pattern').getByRole('button', { name: 'Melody', exact: true }).click()
    await expect.poll(code).toContain(`melody: note("~")\n  .s("triangle")\n  .delay(slider(0.25, 0, 1))\n${MIX_LINES}  .mask("<0!8>")\n`)
    await expect(page.getByTestId('lane-melody').getByRole('button', { pressed: true })).toHaveCount(0)
    await expect(page.getByTestId('lane-bass').getByRole('button', { pressed: true })).toHaveCount(8)
    await expect(page.getByTestId('song-length')).toContainText('8 bars')
    await expect(page.getByTestId('strip-melody').locator('.nr-g')).toHaveCount(1)

    await page.getByTestId('add-pattern').getByRole('button', { name: 'Drums', exact: true }).click()
    await expect.poll(code).toContain(')\n  .bank("RolandTR909")\n  .mask("<0!8>")\n')
    await expect(page.getByTestId('lane-drums2').getByRole('button', { pressed: true })).toHaveCount(0)

    await page.getByTestId('strip-bass').getByRole('button', { name: 'More for bass', exact: true }).click()
    await page.getByTestId('strip-bass').getByRole('menuitem', { name: 'Duplicate', exact: true }).click()
    await expect(page.getByTestId('lane-bass2').getByRole('button', { pressed: true })).toHaveCount(0)
    await expect(page.getByTestId('lane-bass').getByRole('button', { pressed: true })).toHaveCount(8)

    await page.getByTestId('status').click()
    await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+z`)
    await expect(page.getByTestId('strip-bass2')).toHaveCount(0)
})
