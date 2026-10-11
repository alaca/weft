import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const SONG = 'setcpm(120/4)\n\nbass: note("c2 e2")\n  .s("sawtooth")\n'
const NEW = 'setcpm(120/4)\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const type = (page: Page, text: string) => page.evaluate((insert) => (window as any).__weft.engine.applyEdit({ from: 0, to: 0, insert }), text)
const name = (page: Page) => page.getByTestId('song-name')
const menu = (page: Page) => page.getByTestId('song-menu')
const rows = (page: Page) => page.getByTestId('your-songs').locator('.sm-o b')

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

// One of the songs that used to come with the app, opened from its file the way its owner will
// open it to publish it.
async function openStored(page: Page, song: string) {
    await page.getByTestId('song-file').setInputFiles({ name: `${song}.weft`, mimeType: 'application/json', buffer: readFileSync(`demos/${song}.weft`) })
    await expect(page.getByTestId('song-note')).toContainText(`Opened ${song}`)
    await expect(name(page)).toContainText(song)
}

async function again(page: Page) {
    await page.waitForTimeout(700)
    await page.reload()
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

test('a new song starts with nothing but the tempo, and the old one is kept', async ({ page }) => {
    await open(page)
    await expect(name(page)).toContainText('Untitled')
    await page.getByTestId('top').getByRole('button', { name: 'New song', exact: true }).click()
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
    await page.getByTestId('top').getByRole('button', { name: 'New song', exact: true }).click()
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
    const save = page.getByTestId('top').getByRole('button', { name: 'Save', exact: true })
    await expect(save).toBeDisabled()
    await type(page, '// one\n')
    await expect(name(page).locator('.proj-d')).toHaveCount(1)
    await name(page).click()
    await expect(page.getByTestId('song-state')).toContainText('Changed since it was saved.')
    await save.click()
    await expect(menu(page)).toHaveCount(0)
    await expect(name(page).locator('.proj-d')).toHaveCount(0)
    await expect(save).toBeDisabled()
    await name(page).click()
    await expect(page.getByTestId('song-state')).toContainText('Saved.')
    await expect(menu(page).getByRole('button', { name: 'Go back to the saved version' })).toHaveCount(0)
    await page.keyboard.press('Escape')

    await type(page, '// two\n')
    await expect(name(page).locator('.proj-d')).toHaveCount(1)
    await name(page).click()
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
    await page.getByTestId('top').getByRole('button', { name: 'Duplicate this song', exact: true }).click()
    await expect(name(page)).toContainText('Untitled copy')
    expect(await code(page)).toBe(SONG)
    await type(page, '// in the copy\n')
    await name(page).click()
    await menu(page).getByRole('button', { name: 'Open Untitled', exact: true }).click()
    await expect.poll(() => code(page)).toBe(SONG)
})

test('a song can be deleted and put back', async ({ page }) => {
    await open(page)
    await page.getByTestId('top').getByRole('button', { name: 'New song', exact: true }).click()
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
    await page.getByTestId('top').getByRole('button', { name: 'New song', exact: true }).click()
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
    await page.getByTestId('top').getByRole('button', { name: 'New song', exact: true }).click()
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
    await page.getByTestId('top').getByRole('button', { name: 'New song', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
    await expect(page.getByTestId('cycle')).toHaveText('1')
    await page.getByTestId('add-pattern').getByRole('button', { name: 'Drums', exact: true }).click()
    await expect(page.getByTestId('strip-drums')).toBeVisible()
    await expect.poll(() => page.evaluate(() => (window as any).__weft.engine.events('bass', 0).length)).toBe(0)
})

test('what is done with a song is in the top bar, and the menu holds the song and your songs', async ({ page }) => {
    await open(page)
    const top = page.getByTestId('top')
    for (const what of ['Save', 'Close song', 'New song', 'Open a file', 'Duplicate this song', 'Export', 'Publish', 'Your account']) await expect(top.getByRole('button', { name: what, exact: true })).toBeVisible()
    await name(page).click()
    await expect(menu(page).getByRole('textbox', { name: 'Name of this song' })).toHaveValue('Untitled')
    await expect(rows(page)).toHaveText(['Untitled'])
    for (const what of ['Save', 'Close song', 'New song', 'Open a file', 'Duplicate', 'Export', 'Publish', 'Your account']) await expect(menu(page).getByRole('button', { name: what })).toHaveCount(0)
    await top.getByRole('button', { name: 'Your account', exact: true }).click()
    await expect(menu(page)).toHaveCount(0)
    await expect(page.getByTestId('account')).toBeVisible()
    await page.getByTestId('account').getByRole('button', { name: 'Close your account', exact: true }).click()
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

for (const demo of ['Glasshouse', 'Low sun', 'Grey area', 'Squelch', 'Spiral', 'Night shift', 'Undertow', 'Slow burn']) {
    test(`the stored song ${demo} opens from its file, plays, and every pattern in it can be clicked`, async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        await open(page)
        await openStored(page, demo)
        await expect(page.getByTestId('code-status')).toHaveText('Stopped')
        await expect(page.getByTestId('guard')).toHaveCount(0)
        const strips = page.locator('.st')
        const count = await strips.count()
        expect(count).toBeGreaterThanOrEqual(4)
        for (let at = 0; at < count; at++) await expect(strips.nth(at).locator('.dg, .nr-g')).toHaveCount(1)
        await page.getByRole('button', { name: 'Play', exact: true }).click()
        await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
        await expect.poll(() => page.evaluate(() => (window as any).__weft.engine.now() as number)).toBeGreaterThan(0.3)
        expect(errors).toEqual([])
    })
}

test('the pictures in the playlist are of the song that is open, not the one before it', async ({ page }) => {
    await open(page)
    const picture = (id: string) => page.getByTestId(`lane-${id}`).locator('.sg-c path').first()
    await expect(picture('bass')).toHaveAttribute('d', /M/)
    await openStored(page, 'Glasshouse')
    await expect(picture('pluck')).toHaveAttribute('d', /M/)
    await expect(picture('drums')).toHaveAttribute('d', /M/)
    const bass = await picture('bass').getAttribute('d')
    expect((bass?.match(/M/g) ?? []).length).toBeGreaterThan(40)
})

const ARRANGED = 'setcpm(240/4)\n\ndrums: s("bd*4, hh*8")\n  .bank("RolandTR909")\n  .lpf(4000)\n  .mask("<1!3 0>")\n\nbass: note("c2 e2 g2 e2")\n  .s("sawtooth")\n  .lpf(slider(800, 100, 8000))\n  .room(.3)\n'

async function openExport(page: Page) {
    await page.getByTestId('top').getByRole('button', { name: 'Export', exact: true }).click()
    await expect(page.getByTestId('export')).toBeVisible()
}

test('the code of a song can be exported as a file', async ({ page }) => {
    await open(page)
    await openExport(page)
    await expect(page.getByTestId('export')).toContainText('Export Untitled')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').getByRole('button', { name: 'Code (.js)', exact: true }).click()])
    expect(download.suggestedFilename()).toBe('Untitled.js')
    const { readFile } = await import('node:fs/promises')
    expect(await readFile(await download.path(), 'utf8')).toBe(SONG)
    await expect(page.getByTestId('export-note')).toHaveText('Saved as Untitled.js, in your downloads folder.')
})

test('a song can be exported as audio, from its first bar to its last, and plays as before afterwards', async ({ page }) => {
    test.setTimeout(90000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await open(page, ARRANGED)
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(() => page.evaluate(() => (window as any).__weft.engine.now() as number)).toBeGreaterThan(1.5)
    await page.getByRole('button', { name: 'Solo bass', exact: true }).click()
    await openExport(page)
    await expect(page.getByTestId('export-size')).toHaveText('16 bit, 44.1 kHz, as on a CD. The whole song, 4 s, about 1.1 MB.')
    const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 60000 }),
        page.getByTestId('export').getByRole('button', { name: 'Export audio', exact: true }).click(),
    ])
    expect(download.suggestedFilename()).toBe('Untitled.wav')
    await expect(page.getByTestId('export-note')).toHaveText('Saved as Untitled.wav, in your downloads folder.')
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')

    const { readFile } = await import('node:fs/promises')
    const bytes = await readFile(await download.path())
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF')
    const rate = bytes.readUInt32LE(24)
    const frames = (bytes.length - 44) / 4
    const seconds = frames / rate
    expect(seconds).toBeGreaterThan(3.9)
    expect(seconds).toBeLessThan(8.1)
    const loudest = (from: number, to: number) => {
        let peak = 0
        for (let frame = Math.floor(from * rate); frame < Math.min(frames, Math.floor(to * rate)); frame++) peak = Math.max(peak, Math.abs(bytes.readInt16LE(44 + frame * 4)))
        return peak / 32767
    }
    expect(loudest(0, 0.05)).toBeGreaterThan(0.2)
    expect(loudest(0, 4)).toBeGreaterThan(0.4)
    expect(loudest(0, seconds)).toBeLessThanOrEqual(1)
    // The kick is in the file although only the bass was soloed, and rests in the last bar.
    const low = (from: number, to: number) => {
        let sum = 0
        let count = 0
        for (let frame = Math.floor(from * rate); frame < Math.floor(to * rate); frame++) {
            sum += Math.abs(bytes.readInt16LE(44 + frame * 4))
            count++
        }
        return sum / count / 32767
    }
    expect(low(0, 0.1)).toBeGreaterThan(low(3, 3.1) * 1.3)

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('export')).toHaveCount(0)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect.poll(() => page.evaluate(() => (window as any).__weft.engine.now() as number)).toBeGreaterThan(0.5)
    await expect
        .poll(() =>
            page.evaluate(() => {
                const wave = (window as any).__weft.engine.waveform() as Float32Array | null
                return wave ? Math.max(...Array.from(wave, Math.abs)) : 0
            }),
        )
        .toBeGreaterThan(0.05)
    expect(errors).toEqual([])
})

test('the audio file is of the format and quality that were chosen, and the choice is kept', async ({ page }) => {
    test.setTimeout(120000)
    await open(page, ARRANGED)
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    await openExport(page)
    const box = page.getByTestId('export')
    const choose = (group: string, label: string) => box.getByRole('group', { name: group, exact: true }).getByRole('button', { name: label, exact: true }).click()
    const chosen = (group: string, label: string) => box.getByRole('group', { name: group, exact: true }).getByRole('button', { name: label, exact: true })
    const { readFile } = await import('node:fs/promises')
    const made = async () => {
        const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), box.getByRole('button', { name: 'Export audio', exact: true }).click()])
        return { name: download.suggestedFilename(), bytes: await readFile(await download.path()) }
    }

    await choose('Quality', 'High')
    await expect(page.getByTestId('export-size')).toHaveText('24 bit, 48 kHz. The whole song, 4 s, about 1.7 MB.')
    const wav = await made()
    expect(wav.name).toBe('Untitled.wav')
    expect(wav.bytes.readUInt16LE(22)).toBe(2)
    expect(wav.bytes.readUInt32LE(24)).toBe(48000)
    expect(wav.bytes.readUInt16LE(34)).toBe(24)
    expect((wav.bytes.length - 44) / 6 / 48000).toBeGreaterThan(3.9)

    await choose('Format', 'MP3')
    await choose('Quality', 'Highest')
    await expect(page.getByTestId('export-size')).toContainText('320 kbps')
    const mp3 = await made()
    expect(mp3.name).toBe('Untitled.mp3')
    await expect(page.getByTestId('export-note')).toHaveText('Saved as Untitled.mp3, in your downloads folder.')
    expect(mp3.bytes[0]).toBe(0xff)
    expect(mp3.bytes[1] & 0xe0).toBe(0xe0)
    expect(mp3.bytes.length).toBeGreaterThan(4 * 40000 * 0.8)
    expect(mp3.bytes.length).toBeLessThan(8.5 * 40000)

    await box.getByRole('button', { name: 'Close', exact: true }).click()
    await openExport(page)
    await expect(chosen('Format', 'MP3')).toHaveAttribute('aria-pressed', 'true')
    await expect(chosen('Quality', 'Highest')).toHaveAttribute('aria-pressed', 'true')
})

// A kick that pushes the bass down on every bar, a pattern that is switched off, and one that
// plays but makes no sound.
const APART =
    'setcpm(120/4)\n\ndrums: stack(\n  s("bd").struct("x ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~").duckorbit(2).duckattack(0.4).duckdepth(1),\n)\n  .bank("RolandTR909")\n  .mask("<1!2>")\n\nbass: note("c2")\n  .s("sawtooth")\n  .lpf(600)\n  .orbit(2)\n  .mask("<1!2>")\n\n_lead: note("c4 e4")\n  .s("square")\n\nghost: note("c3")\n  .s("sine")\n  .gain(0)\n'

// The files of a zip, read from the list at its end.
function unzip(zip: Buffer): { name: string; bytes: Buffer }[] {
    const end = zip.length - 22
    expect(zip.readUInt32LE(end)).toBe(0x06054b50)
    const files = []
    let at = zip.readUInt32LE(end + 16)
    for (let n = 0; n < zip.readUInt16LE(end + 10); n++) {
        const size = zip.readUInt32LE(at + 24)
        const named = zip.readUInt16LE(at + 28)
        const from = zip.readUInt32LE(at + 42)
        const start = from + 30 + zip.readUInt16LE(from + 26) + zip.readUInt16LE(from + 28)
        files.push({ name: zip.subarray(at + 46, at + 46 + named).toString('utf8'), bytes: zip.subarray(start, start + size) })
        at += 46 + named
    }
    return files
}

test('each pattern is exported as a file of its own, as long as the song, with what the others do to it left in', async ({ page }) => {
    test.setTimeout(120000)
    await open(page, APART)
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    await openExport(page)
    const box = page.getByTestId('export')
    await expect(box.getByRole('button', { name: 'The song', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await box.getByRole('button', { name: 'Each pattern', exact: true }).click()
    await expect(page.getByTestId('export-size')).toHaveText('16 bit, 44.1 kHz, as on a CD. 3 files in one zip, each 4 s, about 3.2 MB in all.')
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), box.getByRole('button', { name: 'Export audio', exact: true }).click()])
    expect(download.suggestedFilename()).toBe('Untitled patterns.zip')
    await expect(page.getByTestId('export-note')).toHaveText('Saved as Untitled patterns.zip, in your downloads folder. 2 patterns in it. 1 that never sounds was left out.')

    const { readFile } = await import('node:fs/promises')
    const files = unzip(await readFile(await download.path()))
    expect(files.map((file) => file.name)).toEqual(['Untitled - drums.wav', 'Untitled - bass.wav'])
    for (const file of files) expect(file.bytes.subarray(0, 4).toString('latin1')).toBe('RIFF')
    expect(files[0].bytes.length).toBe(files[1].bytes.length)

    // The kick is not in the bass's file, but the bass still gives way to it: right after the
    // kick it is far quieter than later in the bar.
    const bass = files[1].bytes
    const rate = bass.readUInt32LE(24)
    const level = (from: number, to: number) => {
        let sum = 0
        for (let frame = Math.floor(from * rate); frame < Math.floor(to * rate); frame++) sum += Math.abs(bass.readInt16LE(44 + frame * 4))
        return sum / (Math.floor(to * rate) - Math.floor(from * rate)) / 32767
    }
    expect(level(1.2, 1.8)).toBeGreaterThan(0.02)
    expect(level(0.01, 0.06)).toBeLessThan(level(1.2, 1.8) * 0.5)

    // Asked again, the dialog is back at the whole song.
    await box.getByRole('button', { name: 'Close', exact: true }).click()
    await openExport(page)
    await expect(page.getByTestId('export').getByRole('button', { name: 'The song', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('a whole song is made into audio in far less time than it plays', async ({ page }) => {
    test.setTimeout(120000)
    await open(page)
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    await openStored(page, 'Glasshouse')
    await openExport(page)
    const started = Date.now()
    const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 90000 }),
        page.getByTestId('export').getByRole('button', { name: 'Export audio', exact: true }).click(),
    ])
    expect(Date.now() - started).toBeLessThan(60000)
    const { stat } = await import('node:fs/promises')
    const seconds = ((await stat(await download.path())).size - 44) / 4 / 44100
    expect(seconds).toBeGreaterThan(123)
    expect(seconds).toBeLessThan(128.1)
})
