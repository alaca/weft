import { expect, test, type Page } from '@playwright/test'

const browser = (page: Page) => page.getByTestId('sound-browser')

// The stand-in keeps a list of what it handed out, so that it can be seen how often the
// microphone was asked for and that it was let go of again. The slow one answers late, as a
// headset does.
async function open(page: Page, microphone: 'tone' | 'slow' | 'quiet' | 'silent' | 'refused') {
    await page.addInitScript((kind) => {
        localStorage.setItem('weft.song', 'setcpm(120/4)\n\nlead: note("c2")\n  .s("triangle")\n')
        // How many audio clocks were made, so that a fresh one can be told from the one before.
        const Clock = window.AudioContext
        ;(window as any).__clocks = 0
        window.AudioContext = class extends Clock {
            constructor(options?: AudioContextOptions) {
                super(options)
                ;(window as any).__clocks++
            }
        }
        const handed: MediaStreamTrack[] = []
        ;(window as any).__mics = handed
        const standIn = async () => {
            if (kind === 'refused') throw new DOMException('Permission denied', 'NotAllowedError')
            if (kind === 'slow') await new Promise((done) => setTimeout(done, 1500))
            const context = new AudioContext()
            const tone = context.createOscillator()
            const level = context.createGain()
            level.gain.value = kind === 'quiet' ? 0.02 : kind === 'silent' ? 0 : 1
            const out = context.createMediaStreamDestination()
            tone.connect(level)
            level.connect(out)
            tone.start()
            handed.push(...out.stream.getAudioTracks())
            return out.stream
        }
        const home = typeof MediaDevices === 'undefined' ? null : MediaDevices.prototype
        if (home) Object.defineProperty(home, 'getUserMedia', { value: standIn, configurable: true, writable: true })
        if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: standIn }, configurable: true })
    }, microphone)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    await page.getByRole('button', { name: 'Sounds', exact: true }).click()
    await browser(page).getByRole('radio', { name: /^Yours/ }).click()
}

const clocks = (page: Page) => page.evaluate(() => (window as any).__clocks as number)
const heard = (page: Page) =>
    page.evaluate(() => {
        const wave = (window as any).__weft.engine.waveform() as Float32Array | null
        return wave ? Math.max(...Array.from(wave, Math.abs)) : 0
    })

// Using the microphone can leave the window's sound on something that is heard no more, until
// the app is started again. After a take the sound therefore goes out through a fresh clock.
test('after a take the next press gives the sound a fresh clock, and one more once things have settled', async ({ page }) => {
    await open(page, 'tone')
    await browser(page).getByRole('button', { name: 'Record', exact: true }).click()
    await page.waitForTimeout(700)
    await browser(page).getByRole('button', { name: 'Stop recording', exact: true }).click()
    const hear = browser(page).getByRole('button', { name: 'Hear Recording', exact: true })
    await expect(hear).toBeVisible()
    const before = await clocks(page)

    await hear.click()
    expect(await clocks(page)).toBe(before + 1)
    await expect.poll(() => heard(page)).toBeGreaterThan(0.05)
    // Another press straight after is played on the same clock.
    await hear.click()
    expect(await clocks(page)).toBe(before + 1)

    await page.waitForTimeout(3100)
    await hear.click()
    expect(await clocks(page)).toBe(before + 2)
    await expect.poll(() => heard(page)).toBeGreaterThan(0.05)
    await hear.click()
    expect(await clocks(page)).toBe(before + 2)

    // The song plays on it as on any other.
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect.poll(async () => Number(await page.getByTestId('cycle').textContent()), { timeout: 20_000 }).toBeGreaterThanOrEqual(2)
    expect(await clocks(page)).toBe(before + 2)
})

test('a take from the microphone becomes a sound of your own', async ({ page }) => {
    await open(page, 'tone')
    await browser(page).getByRole('button', { name: 'Record', exact: true }).click()
    const stop = browser(page).getByRole('button', { name: 'Stop recording', exact: true })
    await expect(stop).toContainText('Stop, 0:0')
    await page.waitForTimeout(1300)
    await expect(stop).toContainText('Stop, 0:01')
    await stop.click()
    const row = browser(page).locator('.sb-i')
    await expect(row).toHaveCount(1)
    await expect(row.locator('code')).toHaveText('recording')
    await expect(browser(page).getByRole('button', { name: 'Record', exact: true })).toBeVisible()

    await browser(page).getByRole('button', { name: 'Record', exact: true }).click()
    await page.waitForTimeout(600)
    await browser(page).getByRole('button', { name: 'Stop recording', exact: true }).click()
    await expect(browser(page).locator('.sb-i code')).toHaveText(['recording', 'recording_2'])
})

test('with the count-in on, Record starts the song after a bar of clicks, and the take starts where the song does', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('weft.click', JSON.stringify({ click: false, countIn: true })))
    await open(page, 'tone')
    await browser(page).getByRole('button', { name: 'Record', exact: true }).click()
    await expect(page.getByTestId('cycle-cap')).toHaveText('Count')
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    await expect(page.getByTestId('cycle-cap')).toHaveText('Cycle', { timeout: 4000 })
    // A bar at this tempo is two seconds: the take kept is that much shorter than the time the
    // microphone was open.
    await page.waitForTimeout(1600)
    await browser(page).getByRole('button', { name: 'Stop recording', exact: true }).click()
    const length = browser(page).locator('.sb-i .sb-c')
    await expect(length).toHaveCount(1)
    const seconds = Number((await length.textContent())?.replace(' s', ''))
    expect(seconds).toBeGreaterThan(1)
    expect(seconds).toBeLessThan(2.6)
})

test('a press on Record while the microphone is still opening does not start a second take', async ({ page }) => {
    await open(page, 'slow')
    await browser(page).getByRole('button', { name: 'Record', exact: true }).click()
    const opening = browser(page).getByRole('button', { name: 'Opening', exact: true })
    await expect(opening).toBeDisabled()
    // The keyboard stays on the button, so that the next press of a key is on Record again.
    await expect(opening).toBeFocused()
    await opening.evaluate((button: HTMLButtonElement) => button.click())
    const stop = browser(page).getByRole('button', { name: 'Stop recording', exact: true })
    await expect(stop).toBeVisible()
    await page.waitForTimeout(600)
    await stop.click()
    await expect(browser(page).locator('.sb-i code')).toHaveText(['recording'])
    const mics = await page.evaluate(() => ((window as any).__mics as MediaStreamTrack[]).map((track) => track.readyState))
    expect(mics).toEqual(['ended'])
})
