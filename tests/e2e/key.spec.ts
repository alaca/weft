import { expect, test, type Locator, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\nlead: note(`\n  c4 ~  ~  ~    ~  ~  ~  ~    ~  ~  ~  ~    g4 ~  ~  ~\n`)\n  .s("triangle")\n\nbass: note(`\n  a2 ~  ~  ~\n`)\n  .s("sawtooth")\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const note = (strip: Locator, name: string) => strip.getByRole('button', { name, exact: true })

async function open(page: Page) {
    await page.addInitScript((value) => {
        if (!sessionStorage.getItem('seeded')) {
            localStorage.setItem('weft.song', value)
            sessionStorage.setItem('seeded', '1')
        }
    }, SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

async function point(strip: Locator, step: number, midi: number) {
    const grid = strip.locator('.nr-g')
    await grid.scrollIntoViewIfNeeded()
    const box = (await grid.boundingBox())!
    const high = Number(await grid.getAttribute('data-high'))
    return { x: box.x + ((step - 0.5) / 16) * box.width, y: box.y + (high - midi + 0.5) * 10 }
}

test('with a key chosen the roll only takes the notes of that key', async ({ page }) => {
    await open(page)
    const lead = page.getByTestId('strip-lead')
    await expect(lead.locator('.nr-r.offkey')).toHaveCount(0)
    await lead.getByLabel('Scale this roll keeps to').selectOption('minor')
    await lead.getByLabel('First note of the key').selectOption({ label: 'A' })
    const rows = await lead.locator('.nr-r').count()
    const out = await lead.locator('.nr-r.offkey').count()
    expect(out).toBeGreaterThan(2)
    expect(out).toBeLessThan(rows / 2 + 1)

    const sharp = await point(lead, 5, 61)
    await page.mouse.click(sharp.x, sharp.y)
    await expect(note(lead, 'c4, step 5, 1 step')).toBeVisible()
    expect(await code(page)).not.toContain('c#4')
    const inside = await point(lead, 9, 64)
    await page.mouse.click(inside.x, inside.y)
    await expect(note(lead, 'e4, step 9, 1 step')).toBeVisible()

    await note(lead, 'e4, step 9, 1 step').focus()
    await page.keyboard.press('ArrowUp')
    await expect(note(lead, 'f4, step 9, 1 step')).toBeVisible()
    await page.keyboard.press('ArrowUp')
    await expect(note(lead, 'g4, step 9, 1 step')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(note(lead, 'd4, step 9, 1 step')).toBeVisible()
})

test('with chords switched on a click puts in the chord of the key that stands on the note', async ({ page }) => {
    await open(page)
    const lead = page.getByTestId('strip-lead')
    await expect(lead.getByRole('button', { name: 'Chords', exact: true })).toHaveCount(0)
    await lead.getByLabel('Scale this roll keeps to').selectOption('minor')
    await lead.getByLabel('First note of the key').selectOption({ label: 'A' })
    await lead.getByRole('button', { name: 'Chords', exact: true }).click()
    const at = await point(lead, 9, 60)
    await page.mouse.click(at.x, at.y)
    await expect(note(lead, 'c4, step 9, 1 step')).toBeVisible()
    await expect(note(lead, 'e4, step 9, 1 step')).toBeVisible()
    await expect(note(lead, 'g4, step 9, 1 step')).toBeVisible()
    await expect(lead.locator('.nt')).toHaveCount(5)

    await page.getByTestId('status').click()
    await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+z`)
    await expect(lead.locator('.nt')).toHaveCount(2)

    await lead.getByRole('button', { name: 'Chords', exact: true }).click()
    const one = await point(lead, 9, 60)
    await page.mouse.click(one.x, one.y)
    await expect(lead.locator('.nt')).toHaveCount(3)
})
