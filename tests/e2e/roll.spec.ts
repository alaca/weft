import { expect, test, type Locator, type Page } from '@playwright/test'

const BASS = 'bass: note(`\n  d2 _  ~  ~    f2 ~  ~  ~    ~  ~  ~  ~    a1 _  _  _\n`)\n  .s("sawtooth")\n'
const SONG = `setcpm(120/4)\n\n${BASS}\nlead: note("c4 e4 g4 e4").s("triangle")\n\nkeys: n("0 2 4 2").scale("C:major")\n`

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)

async function open(page: Page, song = SONG) {
    await page.addInitScript((text) => localStorage.setItem('weft.song', text), song)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

async function point(strip: Locator, time: number, midi: number) {
    const grid = strip.locator('.nr-g')
    const box = (await grid.boundingBox())!
    const high = Number(await grid.getAttribute('data-high'))
    const low = Number(await grid.getAttribute('data-low'))
    if (midi > high || midi < low) throw new Error(`${midi} is outside the rows on screen, ${low} to ${high}`)
    return { x: box.x + time * box.width, y: box.y + (high - midi + 0.5) * 10 }
}

const stepTime = (step: number, steps = 16) => (step - 0.5) / steps
const note = (strip: Locator, name: string) => strip.getByRole('button', { name, exact: true })

test('draws the notes of a grid as buttons that say what they are', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    await expect(note(bass, 'd2, step 1, 2 steps')).toBeVisible()
    await expect(note(bass, 'f2, step 5, 1 step')).toBeVisible()
    await expect(note(bass, 'a1, step 13, 4 steps')).toBeVisible()
    await expect(bass.locator('.nt')).toHaveCount(3)
})

test('clicking an empty cell adds a note', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    const at = await point(bass, stepTime(9), 40)
    await page.mouse.click(at.x, at.y)
    await expect.poll(() => code(page)).toContain('  d2 _  ~  ~    f2 ~  ~  ~    e2 ~  ~  ~    a1 _  _  _\n')
    await expect(note(bass, 'e2, step 9, 1 step')).toBeVisible()
})

test('a note can be moved, lengthened and removed from the keyboard', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    await note(bass, 'f2, step 5, 1 step').focus()
    await page.keyboard.press('ArrowRight')
    await expect(note(bass, 'f2, step 6, 1 step')).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(note(bass, 'f#2, step 6, 1 step')).toBeFocused()
    await page.keyboard.press('Shift+ArrowRight')
    await expect(note(bass, 'f#2, step 6, 2 steps')).toBeFocused()
    await expect.poll(() => code(page)).toContain('f#2 _')
    await page.keyboard.press('Delete')
    await expect(bass.locator('.nt')).toHaveCount(2)
    await expect.poll(() => code(page)).not.toContain('f#2')
})

test('a note can be dragged to another step and pitch', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    const from = await point(bass, stepTime(13), 33)
    const to = await point(bass, stepTime(9), 35)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 })
    await page.mouse.move(to.x, to.y, { steps: 4 })
    await page.mouse.up()
    await expect(note(bass, 'b1, step 9, 4 steps')).toBeVisible()
    await expect.poll(() => code(page)).toContain('b1 _  _  _')
})

test('a note dragged above the highest one stays under the pointer', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    const from = await point(bass, stepTime(5), 41)
    const to = await point(bass, stepTime(5), 43)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 6 })
    await page.mouse.up()
    await expect(note(bass, 'g2, step 5, 1 step')).toBeVisible()
    await expect(bass.locator('.nr-g')).toHaveAttribute('data-high', '45')
})

test('dragging the right edge of a note lengthens it', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    const grid = (await bass.locator('.nr-g').boundingBox())!
    const edge = await point(bass, 2 / 16, 38)
    const to = await point(bass, stepTime(4), 38)
    await page.mouse.move(edge.x - 3, edge.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 4 })
    await page.mouse.up()
    expect(grid.width).toBeGreaterThan(200)
    await expect(note(bass, 'd2, step 1, 4 steps')).toBeVisible()
})

test('double-clicking a note removes it', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    const at = await point(bass, stepTime(5), 41)
    await page.mouse.dblclick(at.x, at.y)
    await expect(bass.locator('.nt')).toHaveCount(2)
    await expect.poll(() => code(page)).not.toContain('f2')
})

test('a note laid over another goes on its own line in the code', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    const at = await point(bass, stepTime(1), 43)
    await page.mouse.click(at.x, at.y)
    await expect.poll(() => code(page)).toContain('  d2 _  ~  ~    f2 ~  ~  ~    ~  ~  ~  ~    a1 _  _  _ ,\n  g2 ~  ~  ~    ~  ~  ~  ~    ~  ~  ~  ~    ~  ~  ~  ~\n`)')
})

test('the first click on a compact line turns it into a grid and adds the note', async ({ page }) => {
    await open(page)
    const lead = page.getByTestId('strip-lead')
    await expect(lead.locator('.nt')).toHaveCount(4)
    const at = await point(lead, 0.3, 69)
    await page.mouse.click(at.x, at.y)
    await expect.poll(() => code(page)).toContain('lead: note(`\n  c4 e4 g4 e4 ,\n  ~  a4 ~  ~\n`).s("triangle")')
    await expect(note(lead, 'a4, step 2, 1 step')).toBeVisible()
})

test('a longer pattern repeats its notes and writes slow', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    await bass.getByRole('button', { name: 'Length 2 cycles' }).click()
    await expect.poll(() => code(page)).toContain('`).slow(2)\n  .s("sawtooth")')
    await bass.getByRole('button', { name: 'Cycle 2', exact: true }).click()
    await expect(note(bass, 'd2, step 17, 2 steps')).toBeVisible()
    await bass.getByRole('button', { name: 'Length 1 cycles' }).click()
    await expect.poll(() => code(page)).toContain(BASS)
})

test('the range can be extended an octave', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    const before = Number(await bass.locator('.nr-g').getAttribute('data-high'))
    await bass.getByRole('button', { name: 'Show higher notes' }).click()
    await expect(bass.locator('.nr-g')).toHaveAttribute('data-high', String(before + 12))
})

test('a pattern in scale steps is drawn but says it cannot be edited yet', async ({ page }) => {
    await open(page)
    const keys = page.getByTestId('strip-keys')
    await expect(keys).toContainText('written in scale steps')
    await expect(keys.locator('.nr-g')).toHaveCount(0)
})

test('every pattern of the starter song can be edited by clicking', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    const chords = page.getByTestId('strip-chords')
    await expect(chords.locator('.nr-g')).toHaveCount(1)
    const at = await point(chords, 0.1, 62)
    await page.mouse.click(at.x, at.y)
    await expect.poll(() => code(page)).toContain('`).slow(4)\n  .s("gm_epiano1")')
    await expect(chords.getByRole('button', { name: 'Cycle 4', exact: true })).toBeVisible()
    await expect(note(chords, 'd4, step 1, 1 step')).toBeVisible()
})

test('removing the last note leaves the rows where they were', async ({ page }) => {
    await open(page, 'setcpm(120/4)\n\nbass: note(`\n  d2 ~  ~  ~\n`).s("sawtooth")\n')
    const bass = page.getByTestId('strip-bass')
    await expect(bass.locator('.nr-g')).toHaveAttribute('data-high', '48')
    await note(bass, 'd2, step 1, 1 step').focus()
    await page.keyboard.press('Delete')
    await expect(bass.locator('.nt')).toHaveCount(0)
    await expect(bass.locator('.nr-g')).toHaveAttribute('data-high', '48')
    await expect.poll(() => code(page)).toContain('bass: note("~").s("sawtooth")')
    const at = await point(bass, 0.6, 40)
    await page.mouse.click(at.x, at.y)
    await expect(bass.locator('.nt')).toHaveCount(1)
})
