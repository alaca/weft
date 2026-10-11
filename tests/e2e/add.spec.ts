import { expect, test, type Locator, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n'
const NONE = '~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~'
const CLEAN_DRUMS = (name: string) =>
    `${name}: stack(\n${['bd', 'sd', 'cp', 'hh'].map((sound) => `  s("${sound}").struct("${NONE}"),\n`).join('')})\n  .bank("RolandTR909")\n`

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const chip = (page: Page, name: string) => page.getByTestId('add-pattern').getByRole('button', { name, exact: true })
const step = (strip: Locator, sound: string, at: number) => strip.getByRole('button', { name: `${sound} step ${at}`, exact: true })
const lit = (strip: Locator) => strip.locator('.dg').getByRole('button', { pressed: true })

async function open(page: Page, song = SONG) {
    await page.addInitScript((text) => localStorage.setItem('weft.song', text), song)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

async function clickRoll(page: Page, strip: Locator, time: number, midi: number) {
    const grid = strip.locator('.nr-g')
    const box = (await grid.boundingBox())!
    const high = Number(await grid.getAttribute('data-high'))
    await page.mouse.click(box.x + time * box.width, box.y + (high - midi + 0.5) * 10)
}

test('offers four starters under the strips', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('add-pattern').getByRole('button')).toHaveText(['Drums', 'Bass line', 'Chords', 'Melody'])
})

test('adds drums under a free name, with empty rows ready to click', async ({ page }) => {
    await open(page)
    await chip(page, 'Drums').click()
    await expect.poll(() => code(page)).toBe(`${SONG}\n${CLEAN_DRUMS('drums2')}`)
    const strip = page.getByTestId('strip-drums2')
    await expect(strip).toHaveClass(/sel/)
    await expect(strip.locator('.rn')).toHaveText(['bd', 'sd', 'cp', 'hh'])
    await expect(lit(strip)).toHaveCount(0)
    await step(strip, 'bd', 1).click()
    await expect.poll(() => code(page)).toContain('drums2: stack(\n  s("bd").struct("x ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n  s("sd")')
    await expect(strip.locator('.rn')).toHaveText(['bd', 'sd', 'cp', 'hh'])
})

test('what is clicked into a new pattern is part of the song at once', async ({ page }) => {
    await open(page)
    await chip(page, 'Drums').click()
    const strip = page.getByTestId('strip-drums2')
    await step(strip, 'bd', 1).click()
    await step(strip, 'hh', 3).click()
    await expect.poll(() => page.evaluate(() => (window as any).__weft.engine.events('drums2', 0).length)).toBe(2)
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
})

test('a second pattern of the same kind takes nothing from the first', async ({ page }) => {
    await open(page)
    await chip(page, 'Drums').click()
    const first = page.getByTestId('strip-drums2')
    await step(first, 'bd', 1).click()
    await step(first, 'cp', 5).click()
    await first.getByRole('button', { name: 'Add a sound' }).click()
    await first.getByRole('menuitem', { name: /Open hat/ }).click()
    await chip(page, 'Drums').click()
    const second = page.getByTestId('strip-drums3')
    await expect.poll(async () => (await code(page)).endsWith(`\n\n${CLEAN_DRUMS('drums3')}`)).toBe(true)
    await expect(second.locator('.rn')).toHaveText(['bd', 'sd', 'cp', 'hh'])
    await expect(lit(second)).toHaveCount(0)
    await expect(lit(first)).toHaveCount(2)
    await expect(first.locator('.rn')).toHaveText(['bd', 'sd', 'cp', 'hh', 'oh'])
})

test('a pattern added under the name of one that was removed starts clean too', async ({ page }) => {
    await open(page)
    await chip(page, 'Drums').click()
    const strip = page.getByTestId('strip-drums2')
    await step(strip, 'bd', 1).click()
    await strip.getByRole('button', { name: 'Add a sound' }).click()
    await strip.getByRole('menuitem', { name: /Open hat/ }).click()
    await page.getByRole('button', { name: 'Remove the pattern drums2', exact: true }).click()
    await chip(page, 'Drums').click()
    await expect.poll(() => code(page)).toBe(`${SONG}\n${CLEAN_DRUMS('drums2')}`)
    await expect(strip.locator('.rn')).toHaveText(['bd', 'sd', 'cp', 'hh'])
    await expect(lit(strip)).toHaveCount(0)
})

test('adds a bass line: an empty roll in the low notes, with a knob to turn', async ({ page }) => {
    await open(page)
    await chip(page, 'Bass line').click()
    const strip = page.getByTestId('strip-bass')
    await expect.poll(() => code(page)).toBe(`${SONG}\nbass: note("~")\n  .s("sawtooth")\n  .lpf(slider(900, 100, 8000))\n`)
    await expect(strip.locator('.nt')).toHaveCount(0)
    await expect(strip.locator('.nr-g')).toHaveAttribute('data-low', '28')
    await expect(strip.locator('.nr-g')).toHaveAttribute('data-high', '45')
    await expect(strip.getByRole('slider', { name: 'Cutoff' })).toBeVisible()
})

test('the first note in a new pattern goes where it was clicked and the rows stay put', async ({ page }) => {
    await open(page)
    await chip(page, 'Bass line').click()
    const strip = page.getByTestId('strip-bass')
    await clickRoll(page, strip, 0.3, 38)
    await expect(strip.getByRole('button', { name: 'd2, step 5, 1 step', exact: true })).toBeVisible()
    await expect(strip.locator('.nr-g')).toHaveAttribute('data-low', '28')
    await expect(strip.locator('.nr-g')).toHaveAttribute('data-high', '45')
    await clickRoll(page, strip, 0.8, 33)
    await expect(strip.locator('.nt')).toHaveCount(2)
    await expect.poll(() => code(page)).toContain('bass: note(`\n  ~  ~  ~  ~    d2 ~  ~  ~    ~  ~  ~  ~    a1 ~  ~  ~\n`)\n  .s("sawtooth")')
})

test('adds chords and a melody, each empty with its own sound and range', async ({ page }) => {
    await open(page)
    await chip(page, 'Chords').click()
    await chip(page, 'Melody').click()
    await expect.poll(() => code(page)).toContain('\n\nchords: note("~")\n  .s("gm_epiano1")\n  .room(slider(0.3, 0, 1))\n')
    await expect.poll(() => code(page)).toContain('\n\nmelody: note("~")\n  .s("triangle")\n  .delay(slider(0.25, 0, 1))\n')
    const chords = page.getByTestId('strip-chords').locator('.nr-g')
    const melody = page.getByTestId('strip-melody').locator('.nr-g')
    await expect(chords).toHaveAttribute('data-low', '48')
    await expect(chords).toHaveAttribute('data-high', '67')
    await expect(melody).toHaveAttribute('data-low', '60')
    await expect(melody).toHaveAttribute('data-high', '79')
    await expect(page.locator('.nt')).toHaveCount(0)
})

test('counts up when the name is taken more than once', async ({ page }) => {
    await open(page)
    await chip(page, 'Drums').click()
    await chip(page, 'Drums').click()
    await expect(page.getByTestId('strip-drums3')).toBeVisible()
    await expect(page.locator('.st')).toHaveCount(3)
})

test('keeps the new pattern and the row of starters in sight in a long song', async ({ page }) => {
    await open(page)
    for (const name of ['Bass line', 'Chords', 'Melody', 'Drums', 'Bass line']) await chip(page, name).click()
    await expect(page.getByTestId('strip-bass2')).toBeInViewport()
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
    await expect.poll(() => code(page)).toBe('melody: note("~")\n  .s("triangle")\n  .delay(slider(0.25, 0, 1))\n')
    await expect(page.getByTestId('strip-melody')).toBeVisible()
    await expect(page.getByTestId('controls')).not.toContainText('Give a pattern a name')
})

test('adds the first pattern to a song that only sets the tempo', async ({ page }) => {
    await open(page, 'setcpm(120/4)\n')
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
    await chip(page, 'Drums').click()
    await expect.poll(() => code(page)).toBe(`setcpm(120/4)\n\n${CLEAN_DRUMS('drums')}`)
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
})

test('adds nothing while the code has an error', async ({ page }) => {
    await open(page)
    await page.evaluate(() => (window as any).__weft.engine.applyEdit({ from: 0, to: 0, insert: 'broken: s("bd"\n' }))
    await expect(chip(page, 'Drums')).toBeDisabled()
    await page.evaluate(() => (window as any).__weft.engine.applyEdit({ from: 0, to: 15, insert: '' }))
    await expect(chip(page, 'Drums')).toBeEnabled()
})

test('a pattern added to a song that has been arranged is in none of its bars', async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), 'setcpm(120/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n  .mask("<1!4 0!4>")\n\nbass: note("c2 e2")\n  .s("sawtooth")\n')
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    const code = () => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
    await page.getByTestId('add-pattern').getByRole('button', { name: 'Melody', exact: true }).click()
    await expect.poll(code).toContain('melody: note("~")\n  .s("triangle")\n  .delay(slider(0.25, 0, 1))\n  .mask("<0!8>")\n')
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

test('in a song with nothing arranged a new pattern goes round with the rest', async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), 'setcpm(120/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n')
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await page.getByTestId('add-pattern').getByRole('button', { name: 'Bass line', exact: true }).click()
    await expect(page.getByTestId('strip-bass')).toBeVisible()
    expect(await page.evaluate(() => (window as any).__weft.engine.getCode() as string)).not.toContain('.mask(')
    await expect(page.getByTestId('lane-bass').getByRole('button', { pressed: true })).toHaveCount(16)
})
