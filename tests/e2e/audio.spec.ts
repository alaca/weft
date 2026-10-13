import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\ndrums: stack(\n  s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~"),\n)\n  .bank("RolandTR909")\n  .mask("<1!4>")\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const last = async (page: Page) => (await code(page)).trim().split('\n\n').pop() ?? ''
const browser = (page: Page) => page.getByTestId('sound-browser')

// A tone of so many seconds as a 16 bit WAV file: a take that is longer than a bar.
function take(seconds: number): Buffer {
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
    for (let at = 0; at < frames; at++) file.writeInt16LE(Math.round(Math.sin((at / rate) * 2 * Math.PI * 220) * 16000), 44 + at * 2)
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

test('a long recording is put in the song, moved, cut and faded', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Sounds', exact: true }).click()
    await browser(page).getByRole('radio', { name: /^Yours/ }).click()
    await page.getByTestId('own-files').setInputFiles([{ name: 'Long take.wav', mimeType: 'audio/wav', buffer: take(9.3) }])
    await expect(browser(page).locator('.sb-i')).toHaveCount(1)

    // Nine seconds are a little over four and a half bars of two seconds: it is laid on five
    // bars from the first, and the song of four bars is made as long.
    await browser(page).getByRole('button', { name: 'Put Long take in the song' }).click()
    await expect.poll(() => last(page)).toBe('audio: s("long_take").slice(4.65, "<0 1 2 3 4>")\n  .attack(0.02).release(0.02)\n  .mul(postgain(slider(1, 0, 1.5)))\n  .pan(slider(0.5, 0, 1))')
    await expect.poll(() => code(page)).toContain('.mask("<1!4 0>")')

    const rack = page.getByTestId('audio-audio')
    const field = async (name: string, value: string) => {
        await rack.getByLabel(name).fill(value)
        await rack.getByLabel(name).press('Enter')
    }
    await expect(rack.getByLabel('The bar it starts at')).toHaveValue('1')
    await expect(rack.getByLabel('The last bar it is heard in')).toHaveValue('5')

    // Moved to the third bar, the song grows by the two bars it now ends later.
    await field('The bar it starts at', '3')
    await expect.poll(() => last(page)).toContain('.slice(4.65, "<~!2 0 1 2 3 4>")')
    await expect.poll(() => last(page)).toContain('.mask("<0!2 1!5>")')

    // Every number has a step down and a step up beside it.
    await rack.getByRole('button', { name: 'Start a bar later', exact: true }).click()
    await expect.poll(() => last(page)).toContain('.slice(4.65, "<~!3 0 1 2 3 4>")')
    await rack.getByRole('button', { name: 'Start a bar earlier', exact: true }).click()
    await expect.poll(() => last(page)).toContain('.slice(4.65, "<~!2 0 1 2 3 4>")')

    await rack.getByRole('button', { name: 'Later by 10 milliseconds' }).click()
    await expect.poll(() => last(page)).toContain('.late(0.005)')
    await expect(rack.getByTestId('audio-late')).toHaveText('10 ms after the bar')
    await rack.getByRole('button', { name: 'Earlier by 10 milliseconds' }).click()
    await expect.poll(() => last(page)).not.toContain('late')

    // Heard from the fourth bar to the sixth, coming in over a second and going out over two.
    await field('The first bar it is heard in', '4')
    await field('The last bar it is heard in', '6')
    await expect.poll(() => last(page)).toContain('.mask("<0!3 1!3>")')
    await field('Fade in, in seconds', '0.9')
    await rack.getByRole('button', { name: 'A longer fade in', exact: true }).click()
    await field('Fade out, in seconds', '2')
    await expect.poll(() => last(page)).toContain('.attack("<0.02!3 1 0.02!2>").release("<0.02!5 2>")')

    // A faster song has more bars in the same seconds, and the recording is told so.
    await page.getByTestId('tempo').fill('150')
    await page.getByTestId('tempo').press('Enter')
    await expect.poll(() => last(page)).toContain('.slice(5.8125, ')
    await expect(rack.getByTestId('audio-unfit')).toHaveCount(0)
})
