import { expect, test, type Page } from '@playwright/test'

const HH = 'x ~ x ~   x ~ x ~   x ~ x ~   x ~ x ~'
const NONE = '~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~'
const PERC = `perc: stack(\n  s("hh").struct("${HH}"),\n)\n`
const OLD = 'old: s(`\n  hh ~  hh ~    hh ~  hh ~    hh ~  hh ~    hh ~  hh ~\n`)\n'
const SONG = `setcpm(120/4)\n\ndrums: s("bd*4, [~ cp]*2")\n  .bank("RolandTR909")\n\n${PERC}\n${OLD}\nbass: note("d2 ~ d2 f2").s("sawtooth")\n`
const DRUMS_KIT = 'drums: stack(\n  s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~"),\n  s("cp").struct("~ ~ ~ ~   x ~ ~ ~   ~ ~ ~ ~   x ~ ~ ~"),\n'

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
    await expect.poll(() => code(page)).toContain('  s("hh").struct("x x x ~   x ~ x ~   x ~ x ~   x ~ x ~"),\n')
    await expect(step).toHaveAttribute('aria-pressed', 'true')
    await step.click()
    await expect.poll(() => code(page)).toContain(PERC)
})

test('the first click on a compact pattern gives each sound a line of its own', async ({ page }) => {
    await open(page)
    const drums = page.getByTestId('strip-drums')
    await drums.getByRole('button', { name: 'cp step 1', exact: true }).click()
    await expect
        .poll(() => code(page))
        .toContain('drums: stack(\n  s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~"),\n  s("cp").struct("x ~ ~ ~   x ~ ~ ~   ~ ~ ~ ~   x ~ ~ ~"),\n)\n  .bank("RolandTR909")')
    await expect(drums.getByRole('button', { name: 'cp step 1', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(drums.getByRole('button', { name: 'bd step 5', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('a grid written the older way as one text is read, and rewritten on the first click', async ({ page }) => {
    await open(page)
    const old = page.getByTestId('strip-old')
    await expect(old.locator('.pad.on')).toHaveCount(8)
    await old.getByRole('button', { name: 'hh step 2', exact: true }).click()
    await expect.poll(() => code(page)).toContain('old: stack(\n  s("hh").struct("x x x ~   x ~ x ~   x ~ x ~   x ~ x ~"),\n)\n')
    await expect(old.locator('.pad.on')).toHaveCount(9)
})

test('a sound can be added, given a hit, emptied and removed', async ({ page }) => {
    await open(page)
    const drums = page.getByTestId('strip-drums')
    await drums.getByRole('button', { name: 'Add a sound' }).click()
    await drums.getByRole('menuitem', { name: /Open hat/ }).click()
    await expect(drums.getByRole('button', { name: 'Hear oh' })).toBeVisible()
    await expect.poll(() => code(page)).toContain(`${DRUMS_KIT}  s("oh").struct("${NONE}"),\n)\n  .bank("RolandTR909")`)

    const step = drums.getByRole('button', { name: 'oh step 3', exact: true })
    await step.click()
    await expect.poll(() => code(page)).toContain('  s("oh").struct("~ ~ x ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n')
    await step.click()
    await expect.poll(() => code(page)).toContain(`  s("oh").struct("${NONE}"),\n`)
    await expect(drums.getByRole('button', { name: 'Hear oh' })).toBeVisible()

    await drums.getByRole('button', { name: 'Hear oh' }).hover()
    await drums.getByRole('button', { name: 'Remove oh' }).click()
    await expect.poll(() => code(page)).toContain(`${DRUMS_KIT})\n  .bank("RolandTR909")`)
    await expect(drums.getByRole('button', { name: 'Hear oh' })).toHaveCount(0)
})

test('a longer pattern repeats its steps, gets pages and writes slow', async ({ page }) => {
    await open(page)
    const perc = page.getByTestId('strip-perc')
    await perc.getByRole('button', { name: 'Length 2 cycles' }).click()
    await expect.poll(() => code(page)).toContain(`perc: stack(\n  s("hh").struct("${HH}   ${HH}"),\n).slow(2)\n`)

    await perc.getByRole('button', { name: 'Cycle 2', exact: true }).click()
    await perc.getByRole('button', { name: 'hh step 2', exact: true }).click()
    await expect.poll(() => code(page)).toContain(`  s("hh").struct("${HH}   x x x ~   x ~ x ~   x ~ x ~   x ~ x ~"),\n`)
    await perc.getByRole('button', { name: 'Cycle 1', exact: true }).click()
    await expect(perc.getByRole('button', { name: 'hh step 2', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await perc.getByRole('button', { name: 'Cycle 2', exact: true }).click()
    await perc.getByRole('button', { name: 'hh step 2', exact: true }).click()

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

test('a new kit stays a grid at its longest and finest, four cycles of 32 steps', async ({ page }) => {
    await open(page)
    await page.getByTestId('add-pattern').getByRole('button', { name: 'Drums', exact: true }).click()
    const drums = page.getByTestId('strip-drums2')
    await drums.getByRole('button', { name: 'Length 4 cycles' }).click()
    await drums.getByRole('button', { name: '32 steps a cycle' }).click()
    await expect(drums.locator('.rn')).toHaveText(['bd', 'sd', 'cp', 'hh'])
    await expect(drums.locator('.pad')).toHaveCount(128)
    await expect.poll(() => code(page)).toContain(').slow(4)\n  .bank("RolandTR909")')
    await drums.getByRole('button', { name: 'Cycle 4', exact: true }).click()
    await drums.getByRole('button', { name: 'bd step 32', exact: true }).click()
    await expect(drums.locator('.pad.on')).toHaveCount(1)
    await expect.poll(() => page.evaluate(() => (window as any).__weft.engine.events('drums2', 3).length)).toBe(1)
})

test('a kit with no sounds says so and takes a first one', async ({ page }) => {
    await open(page, 'drums: stack(\n)\n  .bank("RolandTR909")\n')
    const drums = page.getByTestId('strip-drums')
    await expect(drums).toContainText('No sounds yet. Add one below.')
    await drums.getByRole('button', { name: 'Add a sound' }).click()
    await drums.getByRole('menuitem', { name: /Kick/ }).click()
    await expect.poll(() => code(page)).toBe(`drums: stack(\n  s("bd").struct("${NONE}"),\n)\n  .bank("RolandTR909")\n`)
    await drums.getByRole('button', { name: 'Hear bd' }).hover()
    await drums.getByRole('button', { name: 'Remove bd' }).click()
    await expect.poll(() => code(page)).toBe('drums: stack(\n)\n  .bank("RolandTR909")\n')
    await expect(drums).toContainText('No sounds yet. Add one below.')
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
    await expect.poll(() => code(page)).toContain('.struct("x x x ~')
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
    await expect.poll(() => page.evaluate(() => (window as any).__weft.engine.events('perc', 0).length)).toBe(9)
})

test('a converted pattern keeps its sounds in the order they were written', async ({ page }) => {
    await open(page, 'drums: s("bd*4, [~ cp]*2, hh*8")\n')
    const drums = page.getByTestId('strip-drums')
    await drums.getByRole('button', { name: 'cp step 1', exact: true }).click()
    await expect(drums.locator('.rn')).toHaveText(['bd', 'cp', 'hh'])
    await expect.poll(async () => (await code(page)).split('\n').slice(1, 4).map((line) => line.trim().slice(0, 7))).toEqual(['s("bd")', 's("cp")', 's("hh")'])
})

test('a hit can be made louder with Shift, or the A key, and plain again the same way', async ({ page }) => {
    await open(page)
    const perc = page.getByTestId('strip-perc')
    const step = (at: number) => perc.getByRole('button', { name: `hh step ${at}`, exact: true })
    await step(2).click({ modifiers: ['Shift'] })
    await expect(step(2)).toHaveAttribute('aria-pressed', 'true')
    await expect(step(2)).toHaveAttribute('data-loud', '')
    await expect.poll(() => code(page)).toContain('  s("hh").struct("x x x ~   x ~ x ~   x ~ x ~   x ~ x ~").postgain("1 1.5 1 1   1 1 1 1   1 1 1 1   1 1 1 1"),\n')
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')

    await step(3).click({ modifiers: ['Shift'] })
    await expect(step(3)).toHaveAttribute('data-loud', '')
    await expect.poll(() => code(page)).toContain('.postgain("1 1.5 1.5 1   ')

    await step(3).focus()
    await page.keyboard.press('a')
    await expect(step(3)).not.toHaveAttribute('data-loud', '')
    await expect(step(3)).toHaveAttribute('aria-pressed', 'true')
    await step(2).click()
    await expect(step(2)).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => code(page)).not.toContain('.postgain(')
    expect(await code(page)).toContain('  s("hh").struct("x ~ x ~   x ~ x ~   x ~ x ~   x ~ x ~"),\n')
})
