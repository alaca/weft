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
