import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(240/4)\n\ndrums: stack(\n  s("bd").struct("~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n)\n  .bank("RolandTR909")\n\nlead: note(`\n  c2 ~  ~  ~\n`)\n  .s("triangle")\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const browser = (page: Page) => page.getByTestId('sound-browser')
const heard = (page: Page) =>
    page.evaluate(() => {
        const wave = (window as any).__weft.engine.waveform() as Float32Array | null
        return wave ? Math.max(...Array.from(wave, Math.abs)) : 0
    })

// Half a second of a plain tone as a 16 bit WAV file.
function tone(hertz = 330, seconds = 0.5): Buffer {
    const rate = 22050
    const frames = Math.round(rate * seconds)
    const file = Buffer.alloc(44 + frames * 2)
    file.write('RIFF', 0, 'latin1')
    file.writeUInt32LE(36 + frames * 2, 4)
    file.write('WAVEfmt ', 8, 'latin1')
    file.writeUInt32LE(16, 16)
    file.writeUInt16LE(1, 20)
    file.writeUInt16LE(1, 22)
    file.writeUInt32LE(rate, 24)
    file.writeUInt32LE(rate * 2, 28)
    file.writeUInt16LE(2, 32)
    file.writeUInt16LE(16, 34)
    file.write('data', 36, 'latin1')
    file.writeUInt32LE(frames * 2, 40)
    for (let at = 0; at < frames; at++) file.writeInt16LE(Math.round(Math.sin((at / rate) * 2 * Math.PI * hertz) * 20000), 44 + at * 2)
    return file
}

async function open(page: Page) {
    await page.addInitScript((value) => {
        if (!sessionStorage.getItem('seeded')) {
            localStorage.setItem('weft.song', value)
            sessionStorage.setItem('seeded', '1')
        }
    }, SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
}

async function yours(page: Page, pattern?: string) {
    if (pattern) await page.getByTestId(`strip-${pattern}`).locator('.st-n').click()
    if (!(await browser(page).count())) await page.getByRole('button', { name: 'Sounds', exact: true }).click()
    await browser(page).getByRole('radio', { name: /^Yours/ }).click()
}

const add = (page: Page, files: { name: string; buffer: Buffer; mimeType?: string }[]) =>
    page.getByTestId('own-files').setInputFiles(files.map((file) => ({ mimeType: 'audio/wav', ...file })))

test('an audio file of your own is added to the sounds and is still there after a restart', async ({ page }) => {
    await open(page)
    await yours(page)
    await expect(browser(page)).toContainText('Nothing here yet')
    await add(page, [{ name: 'My Take 1.wav', buffer: tone() }])
    const row = browser(page).locator('.sb-i')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('My take 1')
    await expect(row.locator('code')).toHaveText('my_take_1')
    await expect(row).toContainText('0.5 s')
    await row.getByRole('button', { name: 'Hear My take 1', exact: true }).click()
    await expect.poll(() => heard(page)).toBeGreaterThan(0.05)

    await page.reload()
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    await yours(page)
    await expect(browser(page).locator('.sb-i code')).toHaveText('my_take_1')
})

test('your own sound can be the sound of a pattern that plays notes', async ({ page }) => {
    await open(page)
    await yours(page, 'lead')
    await add(page, [{ name: 'hook.wav', buffer: tone() }])
    await browser(page).getByRole('button', { name: 'Use Hook for lead', exact: true }).click()
    await expect.poll(() => code(page)).toContain('  .s("hook")\n')
    await expect(browser(page).locator('.sb-i')).toContainText('In use')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing')
    await expect.poll(() => heard(page)).toBeGreaterThan(0.05)
})

test('a file that is not sound is refused, and a name that is taken gets a number', async ({ page }) => {
    await open(page)
    await yours(page)
    await add(page, [
        { name: 'notes.txt', buffer: Buffer.from('this is not a recording'), mimeType: 'text/plain' },
        { name: 'bd.wav', buffer: tone() },
    ])
    await expect(page.getByTestId('own-note')).toHaveText('notes.txt could not be read as sound, so it was not added.')
    await expect(browser(page).locator('.sb-i code')).toHaveText(['bd_2'])
})

test('a sound of your own is cut shorter, and stays so', async ({ page }) => {
    await open(page)
    await yours(page)
    await add(page, [{ name: 'Long take.wav', buffer: tone(330, 2) }])
    const row = browser(page).locator('.sb-i', { hasText: 'long_take' })
    await expect(row).toContainText('2.0 s')
    await row.hover()
    await row.getByRole('button', { name: /^Cut .* shorter$/ }).click()
    const box = page.getByTestId('trim')
    await expect(page.getByTestId('trim-length')).toHaveText('2.0 s kept')

    // The start is moved in with the keys, the end by dragging its edge to the middle.
    await box.getByRole('slider', { name: 'Where it starts', exact: true }).focus()
    for (let press = 0; press < 5; press++) await page.keyboard.press('Shift+ArrowRight')
    const picture = (await box.locator('.tr-w').boundingBox())!
    await page.mouse.move(picture.x + picture.width - 2, picture.y + 40)
    await page.mouse.down()
    await page.mouse.move(picture.x + picture.width / 2, picture.y + 40, { steps: 4 })
    await page.mouse.up()
    await expect(page.getByTestId('trim-length')).toHaveText('0.5 s kept')
    await box.getByRole('button', { name: 'Keep this part', exact: true }).click()
    await expect(box).toHaveCount(0)
    await expect(row).toContainText('0.5 s')

    await page.reload()
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await yours(page)
    await expect(browser(page).locator('.sb-i', { hasText: 'long_take' })).toContainText('0.5 s')
})

