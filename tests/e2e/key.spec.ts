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
    await lead.getByLabel('Scale of the song').selectOption('minor')
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

test('the key belongs to the song: every roll has it, it is kept, and another song has its own', async ({ page }) => {
    await open(page)
    await page.getByTestId('strip-lead').getByLabel('Scale of the song').selectOption('blues')
    await page.getByTestId('strip-lead').getByLabel('First note of the key').selectOption({ label: 'E' })
    await expect(page.getByTestId('strip-bass').getByLabel('Scale of the song')).toHaveValue('blues')
    await expect(page.getByTestId('strip-bass').getByLabel('First note of the key')).toHaveValue('4')
    const before = await code(page)

    await page.waitForTimeout(700)
    await page.reload()
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('strip-lead').getByLabel('Scale of the song')).toHaveValue('blues')
    expect(await code(page)).toBe(before)
    await expect(page.getByTestId('song-name')).not.toContainText('not saved')

    await page.getByTestId('song-name').click()
    await page.getByTestId('song-menu').getByRole('button', { name: 'Open a copy of Undertow', exact: true }).click()
    await expect(page.getByTestId('strip-guitar').getByLabel('Scale of the song')).toHaveValue('')
    await expect(page.getByTestId('strip-guitar').locator('.nr-r.offkey')).toHaveCount(0)

    await page.getByTestId('song-name').click()
    await page.getByTestId('song-menu').getByRole('button', { name: 'Open Untitled', exact: true }).click()
    await page.getByTestId('strip-lead').getByLabel('Scale of the song').selectOption('')
    await expect(page.getByTestId('strip-lead').locator('.nr-r.offkey')).toHaveCount(0)
    await expect(page.getByTestId('strip-lead').getByLabel('First note of the key')).toHaveCount(0)
})
