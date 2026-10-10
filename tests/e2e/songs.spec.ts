import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\nbass: note("c2 e2")\n  .s("sawtooth")\n'
const NEW = 'setcpm(120/4)\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const type = (page: Page, text: string) => page.evaluate((insert) => (window as any).__weft.engine.applyEdit({ from: 0, to: 0, insert }), text)
const name = (page: Page) => page.getByTestId('song-name')
const menu = (page: Page) => page.getByTestId('song-menu')
const rows = (page: Page) => menu(page).locator('.sm-o b')

async function open(page: Page, text: string | null = SONG) {
    if (text !== null) {
        await page.addInitScript((value) => {
            if (!sessionStorage.getItem('seeded')) {
                localStorage.setItem('weft.song', value)
                sessionStorage.setItem('seeded', '1')
            }
        }, text)
    }
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

async function again(page: Page) {
    await page.waitForTimeout(700)
    await page.reload()
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

test('the first song is the starter, under its own name', async ({ page }) => {
    await open(page, null)
    await expect(name(page)).toContainText('Night bus')
    await name(page).click()
    await expect(rows(page)).toHaveText(['Night bus'])
    await expect(page.getByTestId('song-state')).toContainText('Saved.')
})

test('a new song starts with nothing but the tempo, and the old one is kept', async ({ page }) => {
    await open(page)
    await expect(name(page)).toContainText('Untitled')
    await name(page).click()
    await menu(page).getByRole('button', { name: 'New song' }).click()
    await expect(menu(page)).toHaveCount(0)
    await expect(name(page)).toContainText('Untitled 2')
    await expect.poll(() => code(page)).toBe(NEW)
    await expect(page.locator('.st')).toHaveCount(0)
    await expect(page.getByTestId('add-pattern')).toBeVisible()

    await name(page).click()
    await expect(rows(page)).toHaveText(['Untitled 2', 'Untitled'])
    await menu(page).getByRole('button', { name: 'Open Untitled', exact: true }).click()
    await expect(name(page)).toContainText('Untitled')
    await expect.poll(() => code(page)).toBe(SONG)
    await expect(page.getByTestId('strip-bass')).toBeVisible()
})

test('each song keeps its own work, also when the app is closed without saving', async ({ page }) => {
    await open(page)
    await type(page, '// first\n')
    await name(page).click()
    await menu(page).getByRole('button', { name: 'New song' }).click()
    await page.getByTestId('add-pattern').getByRole('button', { name: 'Melody', exact: true }).click()
    await expect.poll(() => code(page)).toContain('melody: note("~")')
    await again(page)
    await expect(name(page)).toContainText('Untitled 2')
    expect(await code(page)).toContain('melody: note("~")')
    await name(page).click()
    await menu(page).getByRole('button', { name: 'Open Untitled', exact: true }).click()
    await expect.poll(() => code(page)).toBe(`// first\n${SONG}`)
})

test('saving marks the version to go back to', async ({ page }) => {
    await open(page)
    await name(page).click()
    await expect(menu(page).getByRole('button', { name: /^Save/ })).toBeDisabled()
    await type(page, '// one\n')
    await expect(name(page).locator('.proj-d')).toHaveCount(1)
    await expect(page.getByTestId('song-state')).toContainText('Changed since it was saved.')
    await menu(page).getByRole('button', { name: /^Save/ }).click()
    await expect(name(page).locator('.proj-d')).toHaveCount(0)
    await expect(page.getByTestId('song-state')).toContainText('Saved.')

    await type(page, '// two\n')
    await expect(name(page).locator('.proj-d')).toHaveCount(1)
    await menu(page).getByRole('button', { name: 'Go back to the saved version' }).click()
    await expect.poll(() => code(page)).toBe(`// one\n${SONG}`)
    await expect(name(page).locator('.proj-d')).toHaveCount(0)
    await again(page)
    expect(await code(page)).toBe(`// one\n${SONG}`)
    await expect(name(page).locator('.proj-d')).toHaveCount(0)
})

test('the save key saves, also from inside the code', async ({ page }) => {
    await open(page)
    await type(page, '// one\n')
    await expect(name(page).locator('.proj-d')).toHaveCount(1)
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+s')
    await expect(name(page).locator('.proj-d')).toHaveCount(0)
    expect(await code(page)).toBe(`// one\n${SONG}`)
})

test('a song can be renamed', async ({ page }) => {
    await open(page)
    await name(page).click()
    const input = menu(page).getByRole('textbox', { name: 'Name of this song' })
    await input.fill('  Morning   loop ')
    await input.press('Enter')
    await expect(name(page)).toContainText('Morning loop')
    await expect(rows(page)).toHaveText(['Morning loop'])
    await input.fill('   ')
    await input.press('Enter')
    await expect(input).toHaveValue('Morning loop')
    await again(page)
    await expect(name(page)).toContainText('Morning loop')
})

test('a song can be duplicated, and the copy is its own song', async ({ page }) => {
    await open(page)
    await name(page).click()
    await menu(page).getByRole('button', { name: 'Duplicate this song' }).click()
    await expect(name(page)).toContainText('Untitled copy')
    expect(await code(page)).toBe(SONG)
    await type(page, '// in the copy\n')
    await name(page).click()
    await menu(page).getByRole('button', { name: 'Open Untitled', exact: true }).click()
    await expect.poll(() => code(page)).toBe(SONG)
})

test('a song can be deleted and put back', async ({ page }) => {
    await open(page)
    await name(page).click()
    await menu(page).getByRole('button', { name: 'New song' }).click()
    await name(page).click()
    await menu(page).getByRole('button', { name: 'Open Untitled', exact: true }).hover()
    await menu(page).getByRole('button', { name: 'Delete Untitled', exact: true }).click()
    await expect(rows(page)).toHaveText(['Untitled 2'])
    await expect(menu(page).getByRole('status')).toContainText('Untitled was deleted.')
    await expect(name(page)).toContainText('Untitled 2')
    await menu(page).getByRole('button', { name: 'Put it back' }).click()
    await expect(rows(page)).toHaveText(['Untitled 2', 'Untitled'])
    await menu(page).getByRole('button', { name: 'Open Untitled', exact: true }).click()
    await expect.poll(() => code(page)).toBe(SONG)
})

test('deleting the song that is open opens another, and deleting the last one leaves a new song', async ({ page }) => {
    await open(page)
    await name(page).click()
    await menu(page).getByRole('button', { name: 'New song' }).click()
    await name(page).click()
    await menu(page).getByRole('button', { name: 'Delete Untitled 2', exact: true }).click()
    await expect(name(page)).toContainText('Untitled')
    await expect.poll(() => code(page)).toBe(SONG)
    await menu(page).getByRole('button', { name: 'Delete Untitled', exact: true }).click()
    await expect.poll(() => code(page)).toBe(NEW)
    await expect(rows(page)).toHaveText(['Untitled'])
})

test('undo in one song cannot bring back the code of another', async ({ page }) => {
    await open(page)
    await page.locator('.cm-content').click()
    await page.keyboard.type('// typed here ')
    await name(page).click()
    await menu(page).getByRole('button', { name: 'New song' }).click()
    await expect.poll(() => code(page)).toBe(NEW)
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+z')
    await page.keyboard.press('ControlOrMeta+z')
    expect(await code(page)).toBe(NEW)
    await page.keyboard.type('x')
    await page.keyboard.press('ControlOrMeta+z')
    expect(await code(page)).toBe(NEW)
})

test('opening another song stops the one that plays and starts from its first bar', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Start from bar 3', exact: true }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await name(page).click()
    await menu(page).getByRole('button', { name: 'New song' }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
    await expect(page.getByTestId('cycle')).toHaveText('1')
    await page.getByTestId('add-pattern').getByRole('button', { name: 'Drums', exact: true }).click()
    await expect(page.getByTestId('strip-drums')).toBeVisible()
    await expect.poll(() => page.evaluate(() => (window as any).__weft.engine.events('bass', 0).length)).toBe(0)
})

test('the menu closes on Escape and on a click outside it', async ({ page }) => {
    await open(page)
    await name(page).click()
    await expect(menu(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu(page)).toHaveCount(0)
    await name(page).click()
    await page.getByTestId('code').locator('h2').click()
    await expect(menu(page)).toHaveCount(0)
})
