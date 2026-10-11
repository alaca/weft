import { expect, test, type Browser, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\ndrums: s("bd*4")\n'

// A microphone that gives a plain tone, in place of the machine's own, and a list of what was
// handed out so that it can be seen to have been let go of again.
function standIn() {
    const handed: MediaStreamTrack[] = []
    ;(window as any).__mics = handed
    MediaDevices.prototype.getUserMedia = async function () {
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
    await expect(them(mara)).toHaveAttribute('data-mic', 'on')
    await expect(them(mara)).toHaveAttribute('data-sound', 'yes')
    await expect(me(mara)).toHaveAttribute('data-mic', 'off')
    await expect(them(ante)).toHaveAttribute('data-sound', 'no')
    expect(await micsLeftOn(mara)).toBe(0)
})

test('a microphone that is switched off is let go of, and the other no longer hears it', async ({ browser }) => {
    const { ante, mara } = await jam(browser)
    await mic(ante).click()
    await mara.getByLabel('Message').click()
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

test('leaving a jam lets go of the microphone', async ({ browser }) => {
    const { ante, mara } = await jam(browser)
    await mic(ante).click()
    await mic(mara).click()
    await expect(me(mara)).toHaveAttribute('data-sound', 'yes')
    expect(await micsLeftOn(mara)).toBe(1)
    await ante.getByRole('button', { name: 'Leave', exact: true }).click()
    await expect(mara.getByTestId('jam-note')).toContainText('Ante left the jam.')
    expect(await micsLeftOn(ante)).toBe(0)
    expect(await micsLeftOn(mara)).toBe(0)
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

test('a microphone that gives nothing but silence is said to be silent', async ({ browser }) => {
    const silent = () => {
        MediaDevices.prototype.getUserMedia = async function () {
            const context = new AudioContext()
            return context.createMediaStreamDestination().stream
        }
    }
    const { mara } = await jam(browser, silent)
    await mic(mara).click()
    await expect(mara.getByTestId('jam-voice-note')).toContainText('Nothing is heard from your microphone.', { timeout: 20000 })
    await expect(mic(mara)).toHaveAttribute('aria-pressed', 'true')
})
