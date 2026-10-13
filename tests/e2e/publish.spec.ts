import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\nvoc: s("long_take")\n'

async function open(page: Page, song = SONG) {
    await page.addInitScript((text) => {
        if (!sessionStorage.getItem('seeded')) {
            localStorage.setItem('weft.song', text)
            sessionStorage.setItem('seeded', '1')
        }
    }, song)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
}

const prepare = (page: Page) => page.evaluate(() => (window as any).__weft.prepareToPublish())

test('a song with code that is more than music is not made ready for publishing', async ({ page }) => {
    await open(page, 'setcpm(120/4)\n\ndrums: s("bd*4")\nfetch("https://example.com/" + document.cookie)\n')
    expect(await prepare(page)).toEqual({ ok: false, refused: { why: 'code', what: 'fetch is not something a song can use', line: 4 } })
})

const SYNTHS = 'setcpm(120/4)\n\nbass: note("c2 c3 c2 e2").s("sawtooth").lpf(600)\n\nlead: note("c4 e4 g4 e4").s("triangle")\n'
const dialog = (page: Page) => page.getByTestId('publish')
const account = (page: Page) => page.getByTestId('account')
const someone = () => `ante+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`

async function openPublish(page: Page) {
    await page.getByTestId('top').getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(dialog(page)).toBeVisible()
}

const PASSWORD = 'a test password 42'

// A new person each time: an account is made in the publish window, which signs it in.
async function signIn(page: Page, email = someone()): Promise<string> {
    await expect(dialog(page).getByRole('button', { name: 'Make an account', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await dialog(page).getByLabel('Your name', { exact: true }).fill('Ante')
    await dialog(page).getByLabel('Your email', { exact: true }).fill(email)
    await dialog(page).getByLabel('Your password', { exact: true }).fill(PASSWORD)
    await dialog(page).getByRole('button', { name: 'Make my account', exact: true }).click()
    await expect(page.getByTestId('publish-count')).toHaveText('You have used 0 of your 10 songs.')
    return email
}

test('a song is published from the app: make an account, say what the song is, and it is on the site', async ({ page }) => {
    await open(page, SYNTHS)
    await openPublish(page)
    await expect(dialog(page)).toContainText('It needs an account: your email and a password.')
    const email = await signIn(page)
    await expect(page.getByTestId('publish-note')).toContainText('The song file is')

    await dialog(page).getByPlaceholder("What people read on the song's page").fill('Two synths going round.')
    await dialog(page).getByPlaceholder('One tag, in your own words').fill('test tone')
    await dialog(page).getByRole('radio', { name: /CC0/ }).click()
    await dialog(page).getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(dialog(page)).toContainText('Untitled is published.', { timeout: 40000 })
    const address = (await dialog(page).locator('.pb-url').textContent())!.trim()
    expect(address).toMatch(/^http:\/\/127\.0\.0\.1:5191\/songs\/[a-z0-9]+$/)

    const file = await page.request.get(`${address}.weft`)
    expect(JSON.parse(await file.text())).toMatchObject({ weft: 1, name: 'Untitled', code: SYNTHS, sounds: [] })
    const preview = await page.request.get(`${address}.mp3`)
    expect(preview.headers()['content-type']).toBe('audio/mpeg')
    const bytes = (await preview.body()).length
    expect(bytes).toBeGreaterThan(200 * 1024)
    expect(bytes).toBeLessThan(700 * 1024)
    const songPage = await page.context().newPage()
    await songPage.goto(address)
    await expect(songPage.getByRole('heading', { name: 'Untitled', level: 1 })).toBeVisible()
    for (const said of ['Ante', 'Two synths going round.', 'test tone', '120 bpm', 'bass', 'lead', 'CC0', 'Download .weft', 'Open in Weft Loom']) await expect(songPage.locator('body')).toContainText(said)
    await songPage.close()

    await dialog(page).getByRole('button', { name: 'Close', exact: true }).click()
    await openPublish(page)
    await expect(page.getByTestId('publish-count')).toHaveText('You have used 1 of your 10 songs.')
    await dialog(page).getByRole('button', { name: 'Your account and your songs', exact: true }).click()
    const mine = page.getByTestId('account-songs')
    await expect(mine).toContainText('Untitled')
    await expect(page.getByTestId('account-count')).toContainText('You have used 1 of your 10 songs. 1 is published and 0 hidden.')
    await mine.getByRole('button', { name: 'Delete', exact: true }).click()
    await mine.getByRole('button', { name: 'Yes, delete Untitled', exact: true }).click()
    await expect(page.getByTestId('account-count')).toHaveText('You have used 0 of your 10 songs.')
    expect((await page.request.get(address)).status()).toBe(404)

    await account(page).getByRole('tab', { name: 'Account', exact: true }).click()
    await account(page).getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(account(page).getByRole('button', { name: 'Sign in', exact: true }).first()).toHaveAttribute('aria-pressed', 'true')
    await expect(account(page).getByLabel('Your email', { exact: true })).toHaveValue(email)
    await account(page).getByLabel('Your password', { exact: true }).fill('not the password')
    await account(page).getByLabel('Your password', { exact: true }).press('Enter')
    await expect(page.getByTestId('account-note')).toHaveText('The email or the password is not right.')
    await account(page).getByLabel('Your password', { exact: true }).fill(PASSWORD)
    await account(page).getByLabel('Your password', { exact: true }).press('Enter')
    await expect(page.getByTestId('account-count')).toHaveText('You have used 0 of your 10 songs.')
})

test('an account needs a name, an address and a password of some length, and an address can have one account', async ({ page }) => {
    await open(page, SYNTHS)
    await openPublish(page)
    const email = someone()
    const note = page.getByTestId('account-note')
    const make = dialog(page).getByRole('button', { name: 'Make my account', exact: true })
    await dialog(page).getByLabel('Your email', { exact: true }).fill(email)
    await dialog(page).getByLabel('Your password', { exact: true }).fill(PASSWORD)
    await make.click()
    await expect(note).toHaveText('Type the name that should stand beside your songs.')
    await dialog(page).getByLabel('Your name', { exact: true }).fill('Ante')
    await dialog(page).getByLabel('Your password', { exact: true }).fill('short')
    await make.click()
    await expect(note).toHaveText('A password needs at least 8 characters.')
    await dialog(page).getByLabel('Your password', { exact: true }).fill(PASSWORD)
    await make.click()
    await expect(page.getByTestId('publish-count')).toHaveText('You have used 0 of your 10 songs.')
    await dialog(page).getByRole('button', { name: 'Close', exact: true }).click()

    await openAccount(page)
    await account(page).getByRole('tab', { name: 'Account', exact: true }).click()
    await account(page).getByRole('button', { name: 'Sign out', exact: true }).click()
    await account(page).getByRole('button', { name: 'Make an account', exact: true }).click()
    await account(page).getByLabel('Your name', { exact: true }).fill('Someone else')
    await account(page).getByLabel('Your password', { exact: true }).fill('another password')
    await account(page).getByRole('button', { name: 'Make my account', exact: true }).click()
    await expect(note).toHaveText('There is already an account with this email. Sign in instead.')
})

async function openAccount(page: Page) {
    await page.getByTestId('top').getByRole('button', { name: 'Your account', exact: true }).click()
    await expect(account(page)).toBeVisible()
}

// An account with one published song, with the account window open on its songs.
async function withASong(page: Page): Promise<{ email: string; address: string }> {
    await open(page, SYNTHS)
    await openPublish(page)
    const email = await signIn(page)
    await dialog(page).getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(dialog(page)).toContainText('Untitled is published.', { timeout: 40000 })
    const address = (await dialog(page).locator('.pb-url').textContent())!.trim()
    await dialog(page).getByRole('button', { name: 'Close', exact: true }).click()
    await openAccount(page)
    await expect(page.getByTestId('account-songs')).toContainText('Untitled')
    return { email, address }
}

test('your songs are kept from the app: what a song says, whether it is shown, and that it is there at all', async ({ page }) => {
    const { address } = await withASong(page)
    const mine = page.getByTestId('account-songs')
    await mine.getByRole('button', { name: 'Edit', exact: true }).click()
    await mine.getByLabel('Description of Untitled').fill('Changed in the app.')
    await mine.getByLabel('Style of Untitled').fill('drone')
    await mine.getByRole('radio', { name: 'CC0', exact: true }).click()
    await mine.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByTestId('account-note')).toHaveText('The song is changed.')
    const shown = await page.context().newPage()
    await shown.goto(address)
    await expect(shown.locator('body')).toContainText('Changed in the app.')
    await expect(shown.locator('body')).toContainText('drone')
    await expect(shown.locator('body')).toContainText('CC0')

    await mine.getByRole('button', { name: 'Hide', exact: true }).click()
    await expect(page.getByTestId('account-count')).toContainText('0 are published and 1 hidden. A hidden song counts.')
    expect((await page.request.get(address)).status()).toBe(404)
    await mine.getByRole('button', { name: 'Show', exact: true }).click()
    await expect(page.getByTestId('account-count')).toContainText('1 is published and 0 hidden.')
    expect((await page.request.get(address)).status()).toBe(200)
    await shown.close()
})

test('a forgotten password is replaced with a code typed into the app', async ({ page }) => {
    const { email } = await withASong(page)
    const note = page.getByTestId('account-note')
    await account(page).getByRole('tab', { name: 'Account', exact: true }).click()
    await account(page).getByRole('button', { name: 'Sign out', exact: true }).click()
    await account(page).getByRole('button', { name: 'Forgot your password?', exact: true }).click()
    await expect(note).toContainText('a code is on its way')
    const code = (await page.getByTestId('account-code').locator('b').textContent())!.trim()
    await account(page).getByLabel('The code that was sent to you').fill('WRONG123')
    await account(page).getByLabel('Your new password').fill('the third password')
    await account(page).getByRole('button', { name: 'Set the new password', exact: true }).click()
    await expect(note).toHaveText('That code is not right, or it has run out. Ask for a new one.')
    await account(page).getByLabel('The code that was sent to you').fill(code.toLowerCase())
    await account(page).getByRole('button', { name: 'Set the new password', exact: true }).click()
    await expect(page.getByTestId('account-count')).toContainText('You have used 1 of your 10 songs.')

    await account(page).getByRole('tab', { name: 'Account', exact: true }).click()
    await account(page).getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(account(page).getByLabel('Your email', { exact: true })).toHaveValue(email)
    await account(page).getByLabel('Your password', { exact: true }).fill(PASSWORD)
    await account(page).getByLabel('Your password', { exact: true }).press('Enter')
    await expect(note).toHaveText('The email or the password is not right.')
})

test('an account is deleted from the app, with its songs', async ({ page }) => {
    const { address } = await withASong(page)
    await account(page).getByRole('tab', { name: 'Account', exact: true }).click()
    await account(page).getByLabel('Your password, to delete the account').fill(PASSWORD)
    await account(page).getByRole('button', { name: 'Delete my account', exact: true }).click()
    await account(page).getByRole('button', { name: 'Yes, delete my account and its songs', exact: true }).click()
    await expect(page.getByTestId('account-note')).toHaveText('Your account and its songs are deleted.')
    await expect(account(page).getByLabel('Your email', { exact: true })).toBeVisible()
    expect((await page.request.get(address)).status()).toBe(404)
})

test('a link to a song asks before anything is opened, and the song that is open stays in front until then', async ({ page }) => {
    const { address } = await withASong(page)
    await page.getByTestId('account').getByRole('button', { name: 'Close your account', exact: true }).click()
    const id = address.split('/').pop()!
    const before = await page.getByTestId('song-name').textContent()
    const ask = page.getByTestId('link-ask')
    await page.evaluate((song) => (window as any).__weft.askFromLink(song), id)
    await expect(ask).toContainText(/^Open .+ by .+\?/)
    await expect(ask).toContainText('A link asked Weft Loom to open this song from the site.')
    await expect(page.getByTestId('song-name')).toHaveText(before!)
    await ask.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(ask).toHaveCount(0)
    await expect(page.getByTestId('song-name')).toHaveText(before!)

    await page.evaluate((song) => (window as any).__weft.askFromLink(song), id)
    await ask.getByRole('button', { name: 'Open it', exact: true }).click()
    await expect(ask).toHaveCount(0)
    await expect(page.getByTestId('song-name')).not.toHaveText(before!)
    await expect(page.getByTestId('song-note')).toContainText('Opened ')

    await page.evaluate(() => (window as any).__weft.askFromLink('nosuchsong0'))
    await expect(page.getByTestId('song-note')).toHaveText('A link asked to open a song that is no longer on the site.')
    await expect(ask).toHaveCount(0)
})

