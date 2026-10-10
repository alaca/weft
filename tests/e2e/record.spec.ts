import { expect, test, type Page } from '@playwright/test'

const browser = (page: Page) => page.getByTestId('sound-browser')

async function open(page: Page, microphone: 'tone' | 'refused') {
    await page.addInitScript((kind) => {
        localStorage.setItem('weft.song', 'setcpm(120/4)\n\nlead: note("c2")\n  .s("triangle")\n')
        const standIn = async () => {
            if (kind === 'refused') throw new DOMException('Permission denied', 'NotAllowedError')
            const context = new AudioContext()
            const tone = context.createOscillator()
            const out = context.createMediaStreamDestination()
            tone.connect(out)
            tone.start()
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

test('a take from the microphone becomes a sound of your own', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'the test build of WebKit has no microphone to stand in for')
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

test('when the microphone cannot be used the browser says so', async ({ page }) => {
    await open(page, 'refused')
    await browser(page).getByRole('button', { name: 'Record', exact: true }).click()
    await expect(page.getByTestId('own-note')).toContainText('The microphone could not be used')
    await expect(browser(page).getByRole('button', { name: 'Record', exact: true })).toBeVisible()
    await expect(browser(page).locator('.sb-i')).toHaveCount(0)
})
