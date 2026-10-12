import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(240/4)\n\nlead: note(`\n  c2 ~  ~  ~\n`)\n  .s("triangle")\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const name = (page: Page) => page.getByTestId('song-name')
const heard = (page: Page) =>
    page.evaluate(() => {
        const wave = (window as any).__weft.engine.waveform() as Float32Array | null
        return wave ? Math.max(...Array.from(wave, Math.abs)) : 0
    })

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

const songFile = (sound: string, text: string) =>
    Buffer.from(JSON.stringify({ weft: 1, name: 'From afar', keys: { vox: '9:minor' }, code: text, sounds: [{ name: sound, file: `${sound}.wav`, type: 'audio/wav', seconds: 0.5, data: tone().toString('base64') }] }))

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

async function openFile(page: Page, file: { name: string; buffer: Buffer }) {
    await page.getByTestId('song-file').setInputFiles({ mimeType: 'application/octet-stream', ...file })
}

test('a song is saved as one file with the sounds of your own that it uses', async ({ page }) => {
    await open(page)
    await page.getByTestId('strip-lead').locator('.st-n').click()
    await page.getByRole('button', { name: 'Sounds', exact: true }).click()
    await page.getByTestId('sound-browser').getByRole('radio', { name: /^Yours/ }).click()
    await page.getByTestId('own-files').setInputFiles([
        { name: 'hook.wav', mimeType: 'audio/wav', buffer: tone() },
        { name: 'spare.wav', mimeType: 'audio/wav', buffer: tone(440) },
    ])
    await page.getByTestId('sound-browser').getByRole('button', { name: 'Use Hook for lead', exact: true }).click()
    await expect.poll(() => code(page)).toContain('  .s("hook")\n')

    await page.getByTestId('top').getByRole('button', { name: 'Export', exact: true }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').getByRole('button', { name: 'Song file (.weft)', exact: true }).click()])
    expect(download.suggestedFilename()).toBe('Untitled.weft')
    const { readFile } = await import('node:fs/promises')
    const kept = JSON.parse(await readFile(await download.path(), 'utf8'))
    expect(kept.weft).toBe(1)
    expect(kept.name).toBe('Untitled')
    expect(kept.code).toBe(await code(page))
    expect(kept.sounds.map((sound: { name: string }) => sound.name)).toEqual(['hook'])
    expect(Buffer.from(kept.sounds[0].data, 'base64').equals(tone())).toBe(true)
})

test('a song file is opened as a new song, with its sounds and its key', async ({ page }) => {
    await open(page)
    const text = 'setcpm(240/4)\n\nvox: note(`\n  c2 ~  ~  ~\n`)\n  .s("far_voice")\n'
    await openFile(page, { name: 'From afar.weft', buffer: songFile('far_voice', text) })
    await expect(name(page)).toContainText('From afar')
    await expect(page.getByTestId('song-note')).toHaveText('Opened From afar, with 1 sound of its own, now among yours.')
    expect(await code(page)).toBe(text)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('strip-vox').getByLabel('Scale this roll keeps to')).toHaveValue('minor')

    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(() => heard(page)).toBeGreaterThan(0.05)
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await page.getByRole('button', { name: 'Sounds', exact: true }).click()
    await page.getByTestId('sound-browser').getByRole('radio', { name: /^Yours/ }).click()
    await expect(page.getByTestId('sound-browser').locator('.sb-i code')).toHaveText(['far_voice'])

    await name(page).click()
    await expect(page.getByTestId('your-songs').locator('.sm-o b')).toHaveText(['From afar', 'Untitled'])

    // Opened once more, its sound is already yours and is not added a second time.
    await openFile(page, { name: 'From afar.weft', buffer: songFile('far_voice', text) })
    await expect(page.getByTestId('song-note')).toHaveText('Opened From afar 2.')
    await expect(page.getByTestId('sound-browser').locator('.sb-i code')).toHaveText(['far_voice'])
})
