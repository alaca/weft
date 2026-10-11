import { expect, test, type Browser, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\ndrums: s("bd*4")\n'
const THEIRS = 'setcpm(120/4)\nwindow.__ran = 1\ndrums: s("bd*4")\n'

const ran = (page: Page, name = '__ran') => page.evaluate((key) => (window as any)[key], name)
const guard = (page: Page) => page.getByTestId('guard')
const status = (page: Page) => page.getByTestId('code-status')
const update = (page: Page) => page.getByRole('button', { name: /^Update/ })

async function open(page: Page, song = SONG) {
    await page.addInitScript((text) => {
        if (!sessionStorage.getItem('seeded')) {
            localStorage.setItem('weft.song', text)
            sessionStorage.setItem('seeded', '1')
        }
    }, song)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

async function type(page: Page, text: string) {
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type(text)
}

async function openFile(page: Page, name: string, text: string) {
    await page.getByTestId('song-name').click()
    await page.getByTestId('song-file').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) })
    await expect(page.getByTestId('song-note')).toContainText('Opened')
    await page.keyboard.press('Escape')
}

test('a song of your own may hold any code, as before', async ({ page }) => {
    await open(page)
    await type(page, '\nwindow.__ran = 1')
    await update(page).click()
    await expect.poll(() => ran(page)).toBe(1)
    await expect(guard(page)).toHaveCount(0)
})

test('a song from a file is not played while it holds more than music code, until you say so', async ({ page }) => {
    await open(page)
    await openFile(page, 'theirs.js', THEIRS)
    await expect(guard(page)).toContainText('This song came from someone else, so only music code is played')
    await expect(status(page)).toHaveText('Line 2: changing a value with = is not music code')
    await update(page).click()
    await page.waitForTimeout(400)
    expect(await ran(page)).toBeUndefined()
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0)

    await guard(page).getByRole('button', { name: 'Play it anyway', exact: true }).click()
    await expect.poll(() => ran(page)).toBe(1)
    await expect(guard(page)).toHaveCount(0)

    await page.reload()
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect.poll(() => ran(page)).toBe(1)
    await expect(guard(page)).toHaveCount(0)
})

test('a song from a file that is all music code plays without a word', async ({ page }) => {
    await open(page)
    await openFile(page, 'fine.js', 'setcpm(120/4)\nconst kick = s("bd*4")\ndrums: kick.lastOf(4, x => x.fast(2))\n')
    await expect(page.getByTestId('strip-drums')).toBeVisible()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    await expect(guard(page)).toHaveCount(0)
    await expect(status(page)).toHaveText('Playing this code')
})

test('taking the line out lets a song from someone else play again', async ({ page }) => {
    await open(page)
    await openFile(page, 'theirs.js', 'setcpm(120/4)\ndrums: s("bd*4")\nfetch("https://example.com")')
    await expect(status(page)).toHaveText('Line 3: fetch is not something a song can use')
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+End')
    for (let at = 0; at < 28; at++) await page.keyboard.press('Backspace')
    await update(page).click()
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    await expect(guard(page)).toHaveCount(0)
})

async function person(browser: Browser, name: string): Promise<Page> {
    const context = await browser.newContext()
    const page = await context.newPage()
    await open(page)
    await page.getByRole('button', { name: 'Jams', exact: true }).click()
    await page.getByLabel('Your name').fill(name)
    await page.getByLabel('Your name').blur()
    return page
}

test('in a jam, code that is more than music is played for neither, and cannot be let through', async ({ browser }) => {
    const ante = await person(browser, 'Ante')
    const mara = await person(browser, 'Mara')
    await ante.getByRole('button', { name: 'Invite someone', exact: true }).click()
    const invite = (await ante.getByTestId('jam-invite').textContent())!.trim()
    await mara.getByLabel('Invite', { exact: true }).fill(invite)
    await mara.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(mara.getByRole('heading', { name: 'Jam with Ante', exact: true })).toBeVisible()

    await type(mara, '\nwindow.__x = 1')
    await update(mara).click()
    await expect(guard(mara)).toContainText('While you jam, only music code is played')
    await expect(guard(ante)).toContainText('While you jam, only music code is played')
    await expect(status(ante)).toHaveText('Line 5: changing a value with = is not music code')
    expect(await ran(mara, '__x')).toBeUndefined()
    expect(await ran(ante, '__x')).toBeUndefined()
    await expect(guard(ante).getByRole('button')).toHaveCount(0)
    await expect(guard(mara).getByRole('button')).toHaveCount(0)

    await mara.getByRole('button', { name: 'Leave', exact: true }).click()
    await expect(ante.getByTestId('jam-note')).toContainText('Mara left the jam.')
    await update(ante).click()
    await ante.waitForTimeout(400)
    expect(await ran(ante, '__x')).toBeUndefined()
    await expect(guard(ante).getByRole('button', { name: 'Play it anyway', exact: true })).toBeVisible()
    for (const context of browser.contexts()) await context.close()
})
