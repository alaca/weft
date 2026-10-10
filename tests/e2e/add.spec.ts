import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const chip = (page: Page, name: string) => page.getByTestId('add-pattern').getByRole('button', { name, exact: true })

async function open(page: Page, song = SONG) {
    await page.addInitScript((text) => localStorage.setItem('weft.song', text), song)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

test('offers six starters under the strips', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('add-pattern').getByRole('button')).toHaveText(['Drums', 'Bass line', 'Chords', 'Melody', 'Empty drums', 'Empty notes'])
})

test('adds drums under a free name, as a grid that can be clicked at once', async ({ page }) => {
    await open(page)
    await chip(page, 'Drums').click()
    await expect
        .poll(() => code(page))
        .toBe(
            SONG +
                '\ndrums2: s(`\n' +
                '  bd ~  ~  ~    bd ~  ~  ~    bd ~  ~  ~    bd ~  ~  ~ ,\n' +
                '  ~  ~  ~  ~    cp ~  ~  ~    ~  ~  ~  ~    cp ~  ~  ~ ,\n' +
                '  ~  ~  hh ~    ~  ~  hh ~    ~  ~  hh ~    ~  ~  hh ~\n' +
                '`)\n  .bank("RolandTR909")\n',
        )
    const strip = page.getByTestId('strip-drums2')
    await expect(strip).toHaveClass(/sel/)
    await expect(strip.getByRole('button', { name: 'bd step 1', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await strip.getByRole('button', { name: 'bd step 2', exact: true }).click()
    await expect.poll(() => code(page)).toContain('  bd bd ~  ~    bd ~  ~  ~')
})

test('a new pattern is part of the song at once', async ({ page }) => {
    await open(page)
    await chip(page, 'Drums').click()
    await expect.poll(() => page.evaluate(() => (window as any).__weft.engine.events('drums2', 0).length)).toBe(10)
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
})

test('adds a bass line with notes to drag and a knob to turn', async ({ page }) => {
    await open(page)
    await chip(page, 'Bass line').click()
    const strip = page.getByTestId('strip-bass')
    await expect(strip.locator('.nt')).toHaveCount(6)
    await expect(strip.getByRole('slider', { name: 'Cutoff' })).toBeVisible()
    await expect.poll(() => code(page)).toContain('\n\nbass: note(`\n  d2 _  ~  d2   ~  ~  f2 ~    d2 _  ~  ~    a1 _  c2 _\n`)\n  .s("sawtooth")\n  .lpf(slider(900, 100, 8000))\n')
})

test('adds chords that last four cycles', async ({ page }) => {
    await open(page)
    await chip(page, 'Chords').click()
    const strip = page.getByTestId('strip-chords')
    await expect(strip.locator('.nt')).toHaveCount(3)
    await expect(strip.getByRole('button', { name: 'Cycle 4', exact: true })).toBeVisible()
    await expect.poll(() => code(page)).toContain('`).slow(4)\n  .s("gm_epiano1")\n  .room(slider(0.3, 0, 1))\n')
})

test('adds a melody', async ({ page }) => {
    await open(page)
    await chip(page, 'Melody').click()
    await expect(page.getByTestId('strip-melody').locator('.nt')).toHaveCount(7)
    await expect.poll(() => code(page)).toContain('`)\n  .s("triangle")\n  .delay(slider(0.25, 0, 1))\n')
})

test('adds empty drums to fill from the kit', async ({ page }) => {
    await open(page)
    await chip(page, 'Empty drums').click()
    await expect.poll(() => code(page)).toContain('\n\ndrums2: s("~")\n  .bank("RolandTR909")\n')
    const strip = page.getByTestId('strip-drums2')
    await strip.getByRole('button', { name: 'Add a sound' }).click()
    await strip.getByRole('menuitem', { name: /Kick/ }).click()
    await strip.getByRole('button', { name: 'bd step 1', exact: true }).click()
    await expect.poll(() => code(page)).toContain('drums2: s(`\n  bd ~  ~  ~    ~  ~  ~  ~    ~  ~  ~  ~    ~  ~  ~  ~\n`)\n  .bank("RolandTR909")\n')
})

test('adds empty notes to click into', async ({ page }) => {
    await open(page)
    await chip(page, 'Empty notes').click()
    await expect.poll(() => code(page)).toContain('\n\nnotes: note("~")\n  .s("triangle")\n')
    const grid = page.getByTestId('strip-notes').locator('.nr-g')
    const box = (await grid.boundingBox())!
    await page.mouse.click(box.x + box.width * 0.3, box.y + 35)
    await expect(page.getByTestId('strip-notes').locator('.nt')).toHaveCount(1)
})

test('counts up when the name is taken more than once', async ({ page }) => {
    await open(page)
    await chip(page, 'Empty drums').click()
    await chip(page, 'Drums').click()
    await expect(page.getByTestId('strip-drums3')).toBeVisible()
    await expect(page.locator('.st')).toHaveCount(3)
})

test('keeps the new pattern and the row of starters in sight in a long song', async ({ page }) => {
    await open(page)
    for (const name of ['Bass line', 'Chords', 'Melody', 'Drums']) await chip(page, name).click()
    await expect(page.getByTestId('strip-drums2')).toBeInViewport()
    await expect(page.getByTestId('add-pattern')).toBeInViewport({ ratio: 1 })
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
    await expect.poll(() => code(page)).toMatch(/^melody: note\(`\n/)
    await expect(page.getByTestId('strip-melody')).toBeVisible()
    await expect(page.getByTestId('controls')).not.toContainText('Give a pattern a name')
})

test('adds the first pattern to a song that only sets the tempo', async ({ page }) => {
    await open(page, 'setcpm(120/4)\n')
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
    await chip(page, 'Drums').click()
    await expect.poll(() => code(page)).toMatch(/^setcpm\(120\/4\)\n\ndrums: s\(`\n/)
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
})

test('adds nothing while the code has an error', async ({ page }) => {
    await open(page)
    await page.evaluate(() => (window as any).__weft.engine.applyEdit({ from: 0, to: 0, insert: 'broken: s("bd"\n' }))
    await expect(chip(page, 'Drums')).toBeDisabled()
    await page.evaluate(() => (window as any).__weft.engine.applyEdit({ from: 0, to: 15, insert: '' }))
    await expect(chip(page, 'Drums')).toBeEnabled()
})
