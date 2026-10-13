import { expect, test, type Page } from '@playwright/test'

// The machine's devices are stood in for: what the window is told there is, what it asks of a
// microphone, and what its clock or its audio elements are told to play through.
async function open(page: Page, route: 'clock' | 'element') {
    await page.addInitScript((how) => {
        if (!sessionStorage.getItem('seeded')) {
            localStorage.setItem('weft.song', 'setcpm(120/4)\n\nlead: note("c2")\n  .s("triangle")\n')
            sessionStorage.setItem('seeded', '1')
        }
        const told: [string, string][] = []
        const asked: unknown[] = []
        ;(window as any).__told = told
        ;(window as any).__asked = asked
        const there = [
            { kind: 'audioinput', deviceId: 'in-1', label: 'Desk microphone', groupId: 'a' },
            { kind: 'audioinput', deviceId: 'in-2', label: 'USB interface', groupId: 'b' },
            { kind: 'audiooutput', deviceId: 'out-1', label: 'Speakers', groupId: 'a' },
            { kind: 'audiooutput', deviceId: 'out-2', label: 'Headphones', groupId: 'b' },
        ]
        const microphone = async (constraints: unknown) => {
            asked.push(constraints)
            const context = new AudioContext()
            const tone = context.createOscillator()
            const out = context.createMediaStreamDestination()
            tone.connect(out)
            tone.start()
            return out.stream
        }
        const home = typeof MediaDevices === 'undefined' ? null : MediaDevices.prototype
        if (home) {
            Object.defineProperty(home, 'enumerateDevices', { value: async () => there, configurable: true, writable: true })
            Object.defineProperty(home, 'getUserMedia', { value: microphone, configurable: true, writable: true })
        } else {
            Object.defineProperty(navigator, 'mediaDevices', { value: { enumerateDevices: async () => there, getUserMedia: microphone, addEventListener() {}, removeEventListener() {} }, configurable: true })
        }
        const say = (who: string) =>
            function (this: unknown, id: string) {
                if (id === 'gone') return Promise.reject(new DOMException('no such device', 'NotFoundError'))
                told.push([who, id])
                return Promise.resolve()
            }
        delete (AudioContext.prototype as any).setSinkId
        delete (HTMLMediaElement.prototype as any).setSinkId
        if (how === 'clock') (AudioContext.prototype as any).setSinkId = say('clock')
        else (HTMLMediaElement.prototype as any).setSinkId = say('element')
    }, route)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
}

const told = (page: Page) => page.evaluate(() => (window as any).__told as [string, string][])
const kept = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('weft.sound') ?? '{}'))
const settings = (page: Page) => page.getByTestId('sound-settings')

async function openSettings(page: Page) {
    if (!(await page.getByTestId('mixer').count())) await page.getByRole('button', { name: 'Mixer', exact: true }).click()
    await page.getByTestId('mixer').getByRole('button', { name: 'Devices', exact: true }).click()
    await expect(settings(page)).toBeVisible()
}

test('the microphone and the output are chosen in the sound settings, and are still chosen after a restart', async ({ page }) => {
    await open(page, 'clock')
    await openSettings(page)
    await expect(settings(page).getByLabel('Output')).toHaveValue('')
    await settings(page).getByLabel('Output').selectOption({ label: 'Headphones' })
    await expect.poll(() => told(page)).toContainEqual(['clock', 'out-2'])
    await settings(page).getByLabel('Microphone').selectOption({ label: 'USB interface' })
    expect(await kept(page)).toMatchObject({ input: 'in-2', output: 'out-2', outputName: 'Headphones' })
    await settings(page).getByRole('button', { name: 'Done', exact: true }).click()

    // A take is made with the microphone that was chosen.
    await page.getByRole('button', { name: 'Sounds', exact: true }).click()
    await page.getByTestId('sound-browser').getByRole('radio', { name: /^Yours/ }).click()
    await page.getByTestId('sound-browser').getByRole('button', { name: 'Record', exact: true }).click()
    await page.getByRole('button', { name: 'Stop recording', exact: true }).click()
    expect(await page.evaluate(() => JSON.stringify((window as any).__asked))).toContain('"deviceId":{"ideal":"in-2"}')

    // After a restart the sound goes out through the same output from the first press on.
    await page.reload()
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    await page.getByTestId('strip-lead').locator('.st-n').click()
    await expect.poll(() => told(page)).toContainEqual(['clock', 'out-2'])
    await openSettings(page)
    await expect(settings(page).getByLabel('Output')).toHaveValue('out-2')
    await expect(settings(page).getByLabel('Microphone')).toHaveValue('in-2')

    // Back to the system's output.
    await settings(page).getByLabel('Output').selectOption({ label: 'The system’s output' })
    await expect.poll(() => told(page)).toContainEqual(['clock', ''])
    expect((await kept(page)).output).toBeNull()
})

test('where the clock cannot be told, the sound is played through an audio element that can', async ({ page }) => {
    await open(page, 'element')
    await openSettings(page)
    await expect(page.getByTestId('sound-output-note')).toContainText('comes a moment later')
    await settings(page).getByLabel('Output').selectOption({ label: 'Speakers' })
    await expect.poll(() => told(page)).toContainEqual(['element', 'out-1'])
    await settings(page).getByRole('button', { name: 'Test', exact: true }).click()
    await expect.poll(() => page.evaluate(() => Math.max(...Array.from(((window as any).__weft.engine.waveform() as Float32Array | null) ?? [0], Math.abs)))).toBeGreaterThan(0.01)
    await settings(page).getByLabel('Output').selectOption({ label: 'The system’s output' })
    expect((await kept(page)).output).toBeNull()
})
