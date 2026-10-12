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

// The place the songs are kept in, filled: one more song that can be deleted, and then filler
// down to the last few characters.
const fill = (page: Page) =>
    page.evaluate(() => {
        localStorage.setItem('weft.songs.old', JSON.stringify({ name: 'Old sketch', saved: `// ${'o'.repeat(6000)}\n`, changedAt: 1 }))
        for (const size of [1_000_000, 100_000, 10_000, 1000, 100, 10]) {
            try {
                for (let at = 0; ; at++) localStorage.setItem(`filler.${size}.${at}`, 'x'.repeat(size))
            } catch {
                // Nothing more of this size fits.
            }
        }
    })

test('when there is no room left for songs it is said, and deleting a song makes room', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const note = page.getByTestId('song-note')
    await open(page)
    await fill(page)
    await page.getByTestId('top').getByRole('button', { name: 'New song', exact: true }).click()
    await expect(note).toContainText('There is no room left for another song.')
    await expect(name(page)).toHaveText('Untitled')

    await type(page, `// ${'n'.repeat(3000)}\n`)
    await expect(note).toContainText('The changes to Untitled are not kept')
    await name(page).click()
    await expect(rows(page)).toHaveText(['Untitled', 'Old sketch'])

    // Deleted and put back, the song is in front again with the changes that are not kept.
    await menu(page).getByRole('button', { name: 'Delete Untitled', exact: true }).click()
    await expect(rows(page)).toHaveText(['Old sketch'])
    await menu(page).getByRole('button', { name: 'Put it back' }).click()
    await expect(rows(page)).toHaveText(['Untitled', 'Old sketch'])
    await expect(name(page)).toHaveText('Untitled')
    expect(await code(page)).toBe(`// ${'n'.repeat(3000)}\n${SONG}`)
    await expect(note).toContainText('The changes to Untitled are not kept')

    await menu(page).getByRole('button', { name: 'Open Old sketch', exact: true }).hover()
    await menu(page).getByRole('button', { name: 'Delete Old sketch', exact: true }).click()
    await expect(rows(page)).toHaveText(['Untitled'])
    await expect(note).toHaveCount(0)
    await again(page)
    expect(await code(page)).toBe(`// ${'n'.repeat(3000)}\n${SONG}`)
    expect(errors).toEqual([])
})

// Two of the eight: the one with the most in it, and one that is played on instruments. That
// each of them is a song the controls can read is looked at for all eight where it is quick.
for (const demo of ['Slow burn', 'Undertow']) {
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

const ARRANGED = 'setcpm(240/4)\n\ndrums: s("bd*4, hh*8")\n  .bank("RolandTR909")\n  .lpf(4000)\n  .mask("<1!3 0>")\n\nbass: note("c2 e2 g2 e2")\n  .s("sawtooth")\n  .lpf(slider(800, 100, 8000))\n  .room(.3)\n'

async function openExport(page: Page) {
    await page.getByTestId('top').getByRole('button', { name: 'Export', exact: true }).click()
    await expect(page.getByTestId('export')).toBeVisible()
}

test('a song can be exported as audio, from its first bar to its last, and plays as before afterwards', async ({ page }) => {
    test.setTimeout(90000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await open(page, ARRANGED)
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(() => page.evaluate(() => (window as any).__weft.engine.now() as number)).toBeGreaterThan(1.5)
    await page.getByTestId('strip-bass').getByRole('button', { name: 'Solo bass', exact: true }).click()
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
