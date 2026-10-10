import { expect, test, type Page } from '@playwright/test'

const PERC = 'perc: s(`\n  hh ~  hh ~    hh ~  hh ~    hh ~  hh ~    hh ~  hh ~\n`)\n'
const SONG = `setcpm(120/4)\n\ndrums: s("bd*4, [~ cp]*2")\n  .bank("RolandTR909")\n\n${PERC}\nbass: note("d2 ~ d2 f2").s("sawtooth")\n`

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)

async function open(page: Page, song = SONG) {
    await page.addInitScript((text) => localStorage.setItem('weft.song', text), song)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

test('clicking a step adds a hit and clicking it again removes it', async ({ page }) => {
    await open(page)
    const perc = page.getByTestId('strip-perc')
    const step = perc.getByRole('button', { name: 'hh step 2', exact: true })
    await expect(step).toHaveAttribute('aria-pressed', 'false')
    await step.click()
    await expect.poll(() => code(page)).toContain('  hh hh hh ~    hh ~  hh ~    hh ~  hh ~    hh ~  hh ~\n')
    await expect(step).toHaveAttribute('aria-pressed', 'true')
    await step.click()
    await expect.poll(() => code(page)).toContain(PERC)
})

test('the first click on a compact pattern turns it into a grid', async ({ page }) => {
    await open(page)
    const drums = page.getByTestId('strip-drums')
    await drums.getByRole('button', { name: 'cp step 1', exact: true }).click()
    await expect
        .poll(() => code(page))
        .toContain('drums: s(`\n  bd ~  ~  ~    bd ~  ~  ~    bd ~  ~  ~    bd ~  ~  ~ ,\n  cp ~  ~  ~    cp ~  ~  ~    ~  ~  ~  ~    cp ~  ~  ~\n`)\n  .bank("RolandTR909")')
    await expect(drums.getByRole('button', { name: 'cp step 1', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(drums.getByRole('button', { name: 'bd step 5', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('a sound can be added, given a hit and removed', async ({ page }) => {
    await open(page)
    const drums = page.getByTestId('strip-drums')
    const before = await code(page)
    await drums.getByRole('button', { name: 'Add a sound' }).click()
    await drums.getByRole('menuitem', { name: /Open hat/ }).click()
    await expect(drums.getByRole('button', { name: 'Hear oh' })).toBeVisible()
    expect(await code(page)).toBe(before)

    await drums.getByRole('button', { name: 'oh step 3', exact: true }).click()
    await expect.poll(() => code(page)).toContain('  ~  ~  oh ~    ~  ~  ~  ~    ~  ~  ~  ~    ~  ~  ~  ~\n`)')

    await drums.getByRole('button', { name: 'Hear oh' }).hover()
    await drums.getByRole('button', { name: 'Remove oh' }).click()
    await expect.poll(() => code(page)).not.toContain('oh')
    await expect(drums.getByRole('button', { name: 'Hear oh' })).toHaveCount(0)
})

test('a longer pattern repeats its steps, gets pages and writes slow', async ({ page }) => {
    await open(page)
    const perc = page.getByTestId('strip-perc')
    await perc.getByRole('button', { name: 'Length 2 cycles' }).click()
    await expect.poll(() => code(page)).toContain('`).slow(2)')
    await expect.poll(async () => ((await code(page)).match(/hh/g) ?? []).length).toBe(16)

    await perc.getByRole('button', { name: 'Cycle 2', exact: true }).click()
    await perc.getByRole('button', { name: 'hh step 2', exact: true }).click()
    await expect.poll(() => code(page)).toContain('hh ~  hh ~    hh ~  hh ~    hh ~  hh ~    hh ~  hh ~    hh hh hh ~')
    await perc.getByRole('button', { name: 'Cycle 1', exact: true }).click()
    await expect(perc.getByRole('button', { name: 'hh step 2', exact: true })).toHaveAttribute('aria-pressed', 'false')

    await perc.getByRole('button', { name: 'Length 1 cycles' }).click()
    await expect.poll(() => code(page)).toContain(PERC)
})

test('32 steps a cycle doubles the grid and 16 brings it back', async ({ page }) => {
    await open(page)
    const perc = page.getByTestId('strip-perc')
    await expect(perc.locator('.pad')).toHaveCount(16)
    await perc.getByRole('button', { name: '32 steps a cycle' }).click()
    await expect(perc.locator('.pad')).toHaveCount(32)
    await expect(perc.locator('.pad.on')).toHaveCount(8)
    await expect(perc.getByRole('button', { name: 'hh step 5', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(perc.getByRole('button', { name: 'hh step 3', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await perc.getByRole('button', { name: '16 steps a cycle' }).click()
    await expect.poll(() => code(page)).toContain(PERC)
})

test('a pattern a grid cannot show says so and is left alone', async ({ page }) => {
    await open(page, 'drums: s("<bd sd> hh")\n')
    const drums = page.getByTestId('strip-drums')
    await drums.getByRole('button', { name: 'hh step 1', exact: true }).click()
    await expect(drums).toContainText('cannot be edited as a grid')
    expect(await code(page)).toBe('drums: s("<bd sd> hh")\n')
})

test('clicking a name plays it without errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await open(page)
    await page.getByTestId('strip-perc').getByRole('button', { name: 'Hear hh' }).click()
    await page.getByTestId('strip-drums').getByRole('button', { name: 'Hear bd' }).click()
    await expect(page.getByTestId('strip-perc').getByRole('button', { name: 'Hear hh' })).toBeVisible()
    expect(errors).toEqual([])
})

test('a note pattern has no grid controls', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('strip-bass').getByRole('button', { name: 'Add a sound' })).toHaveCount(0)
})

test('clicking while stopped keeps the code in step without starting playback', async ({ page }) => {
    await open(page)
    await page.getByTestId('strip-perc').getByRole('button', { name: 'hh step 2', exact: true }).click()
    await expect.poll(() => code(page)).toContain('hh hh hh ~')
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
})

test('a converted pattern keeps its sounds in the order they were written', async ({ page }) => {
    await open(page, 'drums: s("bd*4, [~ cp]*2, hh*8")\n')
    const drums = page.getByTestId('strip-drums')
    await drums.getByRole('button', { name: 'cp step 1', exact: true }).click()
    await expect(drums.locator('.rn')).toHaveText(['bd', 'cp', 'hh'])
    await expect.poll(async () => (await code(page)).split('\n').slice(1, 4).map((line) => line.trim().split(' ')[0])).toEqual(['bd', 'cp', 'hh'])
})
