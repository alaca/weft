import { expect, test, type Page } from '@playwright/test'

const start = (page: Page) => page.getByTestId('start')
const songName = (page: Page) => page.getByTestId('song-name')
const menu = (page: Page) => page.getByTestId('song-menu')
const recent = (page: Page) => page.getByTestId('start-recent')
const card = (page: Page) => page.getByTestId('start-account')
// The account on the start screen is folded away until it is asked for.
const unfold = (page: Page) => card(page).locator('h2 button').click()
const closing = (page: Page) => page.getByTestId('close-song')
const someone = () => `ante+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`
const PASSWORD = 'a test password 42'

// The app as it is on a machine that never ran it: no songs, nothing chosen. The other tests
// start with one song and the start screen skipped; this undoes that.
async function firstStart(page: Page) {
    await page.addInitScript(() => {
        if (sessionStorage.getItem('emptied')) return
        localStorage.clear()
        sessionStorage.setItem('emptied', '1')
    })
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

async function closeSong(page: Page) {
    await page.getByTestId('top').getByRole('button', { name: 'Close song', exact: true }).click()
}

const change = (page: Page) => page.evaluate(() => (window as any).__weft.engine.applyEdit({ from: 0, to: 0, insert: '// changed\n' }))

test('the first start has no songs, offers a new one and the songs on the site, and asks nobody to register', async ({ page }) => {
    await firstStart(page)
    await expect(start(page)).toBeVisible()
    await expect(page.getByTestId('start-none')).toContainText('You have no songs yet.')
    await expect(start(page).getByRole('button', { name: 'New song', exact: true })).toBeVisible()
    await expect(page.getByTestId('start-go-on')).toHaveCount(0)
    await expect(start(page).getByRole('heading', { name: 'Songs on the site' })).toBeVisible()
    await expect(page.getByTestId('start-site-count')).toHaveText(/^\d+ songs?\./)
    await expect(page.getByTestId('start-account-who')).toHaveText('Not signed in')
    await expect(card(page).locator('h2 button')).toHaveAttribute('aria-expanded', 'false')
    await expect(card(page).getByLabel('Your email', { exact: true })).toHaveCount(0)
    await unfold(page)
    await expect(card(page)).toContainText('An account is only for publishing songs. Making music needs none.')
    await expect(card(page).getByRole('button', { name: 'Make an account', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(card(page).getByLabel('Your email', { exact: true })).toBeVisible()

    await page.keyboard.press('Space')
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => (window as any).__weft.engine.now())).toBe(0)

    await start(page).getByRole('button', { name: 'New song', exact: true }).click()
    await expect(start(page)).toHaveCount(0)
    await expect(songName(page)).toContainText('Untitled')
})

test('closing a song with changes asks whether to save them, and loses nothing either way', async ({ page }) => {
    await firstStart(page)
    await start(page).getByRole('button', { name: 'New song', exact: true }).click()
    await change(page)
    await closeSong(page)
    await expect(closing(page)).toContainText('Save the changes to Untitled?')
    await expect(closing(page)).toContainText('Your work is kept either way')
    await closing(page).getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(closing(page)).toHaveCount(0)
    await expect(start(page)).toHaveCount(0)

    await closeSong(page)
    await closing(page).getByRole('button', { name: 'Close without saving', exact: true }).click()
    await expect(start(page)).toBeVisible()
    await expect(recent(page)).toContainText('changed since saved')
    await page.getByTestId('start-go-on').click()
    expect(await page.evaluate(() => (window as any).__weft.engine.getCode())).toContain('// changed')

    await closeSong(page)
    await closing(page).getByRole('button', { name: 'Save and close', exact: true }).click()
    await expect(start(page)).toBeVisible()
    await expect(recent(page)).not.toContainText('changed since saved')
    await recent(page).getByRole('button', { name: 'Open Untitled', exact: true }).click()
    expect(await page.evaluate(() => (window as any).__weft.engine.getCode())).toContain('// changed')
})

test('an account is made on the start screen, and the songs on the site are heard and opened from it', async ({ page }) => {
    test.setTimeout(120000)
    const title = `Start ${Date.now().toString(36)}`
    await firstStart(page)
    const email = someone()
    await unfold(page)
    await card(page).getByLabel('Your name', { exact: true }).fill('Ante')
    await card(page).getByLabel('Your email', { exact: true }).fill(email)
    await card(page).getByLabel('Your password', { exact: true }).fill(PASSWORD)
    await card(page).getByRole('button', { name: 'Make my account', exact: true }).click()
    await expect(page.getByTestId('start-count')).toHaveText('You have used 0 of your 10 songs.')
    await expect(card(page)).toContainText(email)
    await unfold(page)
    await expect(page.getByTestId('start-account-who')).toHaveText('Ante, signed in')
    await expect(card(page)).not.toContainText(email)
    await unfold(page)

    await start(page).getByRole('button', { name: 'New song', exact: true }).click()
    await page.evaluate(() => (window as any).__weft.engine.applyEdit({ from: 14, to: 14, insert: '\nbass: note("c2 c3 c2 e2").s("sawtooth").lpf(600)\n' }))
    await songName(page).click()
    await menu(page).getByLabel('Name of this song').fill(title)
    await menu(page).getByLabel('Name of this song').press('Enter')
    await page.getByTestId('top').getByRole('button', { name: 'Publish', exact: true }).click()
    const publish = page.getByTestId('publish')
    await expect(page.getByTestId('publish-count')).toHaveText('You have used 0 of your 10 songs.')
    await publish.getByPlaceholder('One tag, in your own words').fill('start test')
    await publish.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(publish).toContainText(`${title} is published.`, { timeout: 60000 })
    await publish.getByRole('button', { name: 'Close', exact: true }).click()

    await closeSong(page)
    const closingNow = closing(page)
    if (await closingNow.count()) await closingNow.getByRole('button', { name: 'Save and close', exact: true }).click()
    await expect(page.getByTestId('start-count')).toHaveText('You have used 1 of your 10 songs.')
    await expect(recent(page)).toContainText('on the site')

    await start(page).getByLabel('Search the songs on the site').fill(title)
    const row = page.getByTestId('start-site').locator('.sx-row')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('Ante')
    await expect(row).toContainText('start test')
    await expect(row).toContainText('120 bpm')
    await expect(page.getByTestId('start-site-count')).toHaveText(/^1 of \d+ songs?\./)
    const hear = row.getByRole('button', { name: `Hear half a minute of ${title}`, exact: true })
    await hear.click()
    await expect(row.getByRole('button', { name: `Stop ${title}`, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(row).toContainText(/0:0[1-9] of 0:\d\d/, { timeout: 15000 })
    await row.getByRole('button', { name: `Stop ${title}`, exact: true }).click()

    await row.getByRole('button', { name: 'Open a copy', exact: true }).click()
    await expect(start(page)).toHaveCount(0)
    await expect(songName(page)).toContainText(`${title} 2`)
    expect(await page.evaluate(() => (window as any).__weft.engine.getCode())).toContain('bass: note("c2 c3 c2 e2")')

    await closeSong(page)
    await card(page).getByRole('button', { name: 'Your account', exact: true }).click()
    await expect(page.getByTestId('account-songs')).toContainText(title)
    await page.getByTestId('account').getByRole('button', { name: 'Close your account', exact: true }).click()
    await card(page).getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(card(page).getByRole('button', { name: 'Sign in', exact: true }).first()).toHaveAttribute('aria-pressed', 'true')
    await expect(card(page).getByLabel('Your email', { exact: true })).toHaveValue(email)
})
