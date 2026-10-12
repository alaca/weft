import { expect, test, type Page } from '@playwright/test'

const browser = (page: Page) => page.getByTestId('sound-browser')

// The stand-in keeps a list of what it handed out, so that it can be seen how often the
// microphone was asked for and that it was let go of again. The slow one answers late, as a
// headset does.
async function open(page: Page, microphone: 'tone' | 'slow' | 'quiet' | 'silent' | 'refused') {
    await page.addInitScript((kind) => {
        localStorage.setItem('weft.song', 'setcpm(120/4)\n\nlead: note("c2")\n  .s("triangle")\n')
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

test('a press on Record while the microphone is still opening does not start a second take', async ({ page }) => {
    await open(page, 'slow')
    await browser(page).getByRole('button', { name: 'Record', exact: true }).click()
    const opening = browser(page).getByRole('button', { name: 'Opening', exact: true })
    await expect(opening).toBeDisabled()
    await opening.evaluate((button: HTMLButtonElement) => button.click())
    const stop = browser(page).getByRole('button', { name: 'Stop recording', exact: true })
    await expect(stop).toBeVisible()
    await page.waitForTimeout(600)
    await stop.click()
    await expect(browser(page).locator('.sb-i code')).toHaveText(['recording'])
    const mics = await page.evaluate(() => ((window as any).__mics as MediaStreamTrack[]).map((track) => track.readyState))
    expect(mics).toEqual(['ended'])
})
