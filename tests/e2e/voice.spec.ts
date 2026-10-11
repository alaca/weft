import { expect, test, type Browser, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\ndrums: s("bd*4")\n'

// A microphone that gives a plain tone, in place of the machine's own, and a list of what was
// handed out so that it can be seen to have been let go of again.
function standIn() {
    const handed: MediaStreamTrack[] = []
    const filmed: MediaStreamTrack[] = []
    ;(window as any).__mics = handed
    ;(window as any).__cams = filmed
    MediaDevices.prototype.getUserMedia = async function (wanted?: MediaStreamConstraints) {
        if (wanted?.video) {
            // A camera that shows a square going from side to side.
            const canvas = document.createElement('canvas')
            canvas.width = 320
            canvas.height = 240
            const pen = canvas.getContext('2d')!
            let at = 0
            setInterval(() => {
                pen.fillStyle = '#204060'
                pen.fillRect(0, 0, 320, 240)
                pen.fillStyle = '#e0c040'
                pen.fillRect((at = (at + 8) % 280), 100, 40, 40)
            }, 50)
            const stream = canvas.captureStream(15)
            filmed.push(...stream.getVideoTracks())
            return stream
        }
        const context = new AudioContext()
        const tone = context.createOscillator()
        const out = context.createMediaStreamDestination()
        tone.connect(out)
        tone.start()
        handed.push(...out.stream.getAudioTracks())
        return out.stream
    }
}

async function person(browser: Browser, name: string, mic: () => void = standIn): Promise<Page> {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.addInitScript((text) => localStorage.setItem('weft.song', text), SONG)
    await page.addInitScript(mic)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await page.getByRole('button', { name: 'Jams', exact: true }).click()
    await page.getByLabel('Your name').fill(name)
    await page.getByLabel('Your name').blur()
    return page
}

async function jam(browser: Browser, maraMic: () => void = standIn) {
    const ante = await person(browser, 'Ante')
    const mara = await person(browser, 'Mara', maraMic)
    await ante.getByRole('button', { name: 'Invite someone', exact: true }).click()
    const invite = (await ante.getByTestId('jam-invite').textContent())!.trim()
    await mara.getByLabel('Invite', { exact: true }).fill(invite)
    await mara.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(mara.getByRole('heading', { name: 'Jam with Ante', exact: true })).toBeVisible()
    await expect(ante.getByRole('heading', { name: 'Jam with Mara', exact: true })).toBeVisible()
    return { ante, mara }
}

const me = (page: Page) => page.getByTestId('jam-me')
const them = (page: Page) => page.getByTestId('jam-them')
const mic = (page: Page) => page.getByRole('button', { name: 'Microphone', exact: true })
const micsLeftOn = (page: Page) => page.evaluate(() => ((window as any).__mics as MediaStreamTrack[]).filter((track) => track.readyState === 'live').length)
const cam = (page: Page) => page.getByRole('button', { name: 'Camera', exact: true })
const hear = (page: Page) => page.getByRole('button', { name: 'Hear them', exact: true })
const camsLeftOn = (page: Page) => page.evaluate(() => ((window as any).__cams as MediaStreamTrack[]).filter((track) => track.readyState === 'live').length)
const seen = (page: Page, tile: 'jam-me' | 'jam-them') => page.getByTestId(tile).locator('video').evaluate((video: HTMLVideoElement) => video.videoWidth > 0 && !video.paused).catch(() => false)

test.afterEach(async ({ browser }) => {
    for (const context of browser.contexts()) await context.close()
})

test('nobody is heard until they press for it, and then the other hears them', async ({ browser }) => {
    const { ante, mara } = await jam(browser)
    await expect(me(ante)).toHaveAttribute('data-mic', 'off')
    await expect(them(ante)).toHaveAttribute('data-mic', 'off')
    await expect(them(ante)).toContainText('Mara')
    await expect(me(ante)).toContainText('You')
    await expect(ante.getByTestId('jams')).toContainText('Use headphones')
    expect(await micsLeftOn(ante)).toBe(0)

    await mic(ante).click()
    await expect(mic(ante)).toHaveAttribute('aria-pressed', 'true')
    await expect(me(ante)).toHaveAttribute('data-mic', 'on')
    await expect(me(ante)).toHaveAttribute('data-sound', 'yes')
    // The other is told, and hears nothing until they choose to: taking part in the call is
    // their own step, and it switches nothing of theirs on.
    await expect(them(mara)).toHaveAttribute('data-mic', 'on')
    await expect(mara.getByTestId('jam-call')).toContainText('Ante switched their microphone on.')
    await mara.waitForTimeout(1500)
    await expect(them(mara)).toHaveAttribute('data-sound', 'no')
    await hear(mara).click()
    await expect(mara.getByTestId('jam-call')).toHaveCount(0)
    await expect(them(mara)).toHaveAttribute('data-sound', 'yes')
    await expect(me(mara)).toHaveAttribute('data-mic', 'off')
    await expect(them(ante)).toHaveAttribute('data-sound', 'no')
    expect(await micsLeftOn(mara)).toBe(0)
})

test('a microphone that is switched off is let go of, and the other no longer hears it', async ({ browser }) => {
    const { ante, mara } = await jam(browser)
    await mic(ante).click()
    await hear(mara).click()
    await expect(them(mara)).toHaveAttribute('data-sound', 'yes')
    await mic(ante).click()
    await expect(mic(ante)).toHaveAttribute('aria-pressed', 'false')
    await expect(them(mara)).toHaveAttribute('data-mic', 'off')
    await expect(them(mara)).toHaveAttribute('data-sound', 'no')
    expect(await micsLeftOn(ante)).toBe(0)

    await mic(mara).click()
    await ante.getByLabel('Message').click()
    await expect(them(ante)).toHaveAttribute('data-sound', 'yes')
    await mic(ante).click()
    await expect(them(mara)).toHaveAttribute('data-sound', 'yes')
})

test('a microphone the system does not allow says what to do, and the jam goes on', async ({ browser }) => {
    const refusing = () => {
        MediaDevices.prototype.getUserMedia = async function () {
            throw new DOMException('no', 'NotAllowedError')
        }
    }
    const { ante, mara } = await jam(browser, refusing)
    await mic(mara).click()
    await expect(mara.getByTestId('jam-voice-note')).toContainText('The microphone could not be used: the system did not allow it.')
    await expect(mic(mara)).toHaveAttribute('aria-pressed', 'false')
    await expect(them(ante)).toHaveAttribute('data-mic', 'off')
    await mara.getByLabel('Message').fill('still here')
    await mara.getByLabel('Message').press('Enter')
    await expect(ante.getByTestId('jam-chat')).toContainText('still here')
})

test('nobody is seen until they press for it, then the other sees them, and the camera is let go of again', async ({ browser }) => {
    const { ante, mara } = await jam(browser)
    await expect(me(ante)).toHaveAttribute('data-cam', 'off')
    await expect(them(mara)).toHaveAttribute('data-cam', 'off')
    expect(await camsLeftOn(ante)).toBe(0)

    await cam(ante).click()
    await expect(cam(ante)).toHaveAttribute('aria-pressed', 'true')
    await expect(me(ante)).toHaveAttribute('data-cam', 'on')
    await expect(mara.getByTestId('jam-call')).toContainText('Ante switched their camera on.')
    await expect(them(mara)).toHaveAttribute('data-cam', 'off')
    await mara.getByRole('button', { name: 'See and hear them', exact: true }).click()
    await expect(them(mara)).toHaveAttribute('data-cam', 'on')
    await expect.poll(() => seen(ante, 'jam-me')).toBe(true)
    await expect.poll(() => seen(mara, 'jam-them'), { timeout: 20000 }).toBe(true)
    await expect(me(mara)).toHaveAttribute('data-cam', 'off')
    await expect(them(ante)).toHaveAttribute('data-cam', 'off')
    expect(await camsLeftOn(mara)).toBe(0)

    await cam(mara).click()
    await expect.poll(() => seen(ante, 'jam-them'), { timeout: 20000 }).toBe(true)

    await cam(ante).click()
    await expect(cam(ante)).toHaveAttribute('aria-pressed', 'false')
    await expect(me(ante)).toHaveAttribute('data-cam', 'off')
    await expect(them(mara)).toHaveAttribute('data-cam', 'off')
    expect(await camsLeftOn(ante)).toBe(0)

    await mara.getByRole('button', { name: 'Leave', exact: true }).click()
    await expect.poll(() => camsLeftOn(mara)).toBe(0)
})

