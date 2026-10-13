import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\ndrums: stack(\n  s("bd").struct("~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n  s("sd").struct("~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n)\n  .bank("RolandTR909")\n\nlead: note(`\n  ~ ~ ~ ~   ~ ~ ~ ~\n`)\n  .s("triangle")\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const heard = (page: Page) =>
    page.evaluate(() => {
        const wave = (window as any).__weft.engine.waveform() as Float32Array | null
        return wave ? Math.max(...Array.from(wave, Math.abs)) : 0
    })
// What a keyboard sends: a key pressed, and the same key let go.
const press = (page: Page, note: number, force = 100) => page.evaluate(([n, f]) => (window as any).__keys.send([0x90, n, f]), [note, force])
const letGo = (page: Page, note: number) => page.evaluate((n) => (window as any).__keys.send([0x80, n, 0]), note)

test('a MIDI keyboard plays the pattern you are on, and is written into a piano roll whose Keys are on', async ({ page }) => {
    await page.addInitScript((value) => {
        localStorage.setItem('weft.song', value)
        // A keyboard that is plugged in, as the window would be told of one.
        const input: { name: string; state: string; onmidimessage: ((event: { data: Uint8Array }) => void) | null } = { name: 'Test keys 49', state: 'connected', onmidimessage: null }
        ;(window as any).__keys = { send: (bytes: number[]) => input.onmidimessage?.({ data: new Uint8Array(bytes) }) }
        ;(navigator as any).requestMIDIAccess = async () => ({ inputs: new Map([['one', input]]), onstatechange: null })
    }, SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })

    // Keys on at the piano roll: the keyboard is found, and a key is heard.
    await page.getByTestId('strip-lead').locator('.st-n').click()
    await page.getByRole('button', { name: 'Play lead on the keyboard', exact: true }).click()
    await expect(page.getByTestId('piano-note')).toContainText('A MIDI keyboard plays it too')
    const before = await code(page)
    await press(page, 64)
    await expect.poll(() => heard(page)).toBeGreaterThan(0.01)
    await letGo(page, 64)
    // With the song stopped nothing is written.
    expect(await code(page)).toBe(before)

    // While the song plays, what is played is written into the roll.
    await page.getByRole('button', { name: 'Live', exact: true }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await press(page, 67)
    await page.waitForTimeout(150)
    await letGo(page, 67)
    await expect.poll(() => code(page)).toContain('g4')
    await page.getByRole('button', { name: 'Stop', exact: true }).click()

    // On a drum grid a key plays the sound its note stands for, and writes nothing.
    await page.getByRole('button', { name: 'Play lead on the keyboard', exact: true }).click()
    await page.getByTestId('strip-drums').locator('.st-n').click()
    const drums = await code(page)
    await page.waitForTimeout(700)
    await press(page, 38)
    await expect.poll(() => heard(page)).toBeGreaterThan(0.01)
    expect(await code(page)).toBe(drums)

    // The sound settings name the keyboard.
    await page.getByRole('button', { name: 'Mixer', exact: true }).click()
    await page.getByTestId('mixer').getByRole('button', { name: 'Devices', exact: true }).click()
    await expect(page.getByTestId('sound-midi')).toHaveText('Test keys 49')
})

test('a pattern is sent out over MIDI in place of being played by the app, on the channel that is chosen', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('weft.song', 'setcpm(120/4)\n\nlead: note("c3 e3 g3 c4")\n  .s("triangle")\n')
        // A synth that is plugged in, as the window would be told of one, keeping what it is sent.
        const sent: number[][] = []
        ;(window as any).__sent = sent
        const synth = { name: 'Test synth', state: 'connected', send: (bytes: number[]) => void sent.push(Array.from(bytes)), clear() {} }
        ;(navigator as any).requestMIDIAccess = async () => ({ inputs: new Map(), outputs: new Map([['one', synth]]), onstatechange: null })
    })
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    const sent = () => page.evaluate(() => (window as any).__sent as number[][])

    await page.getByRole('button', { name: 'Sound controls for lead', exact: true }).click()
    const played = page.getByLabel('What plays lead')
    await expect(played).toHaveValue('here')
    // A browser is only asked for its MIDI outputs once the list is gone to.
    await played.focus()
    await played.selectOption({ label: 'MIDI, Test synth' })
    await expect.poll(() => code(page)).toContain('.midi("Test synth")')

    // Its notes go to the synth, each pressed and let go, and the app itself plays none of them.
    await page.getByRole('button', { name: 'Live', exact: true }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(async () => (await sent()).filter((bytes) => bytes[0] === 0x90).map((bytes) => bytes[1])).toEqual(expect.arrayContaining([48, 52, 55, 60]))
    expect((await sent()).some((bytes) => bytes[0] === 0x80)).toBe(true)
    expect(await heard(page)).toBeLessThan(0.001)

    // Another channel, and the notes are sent on it.
    await page.getByLabel('MIDI channel of lead').selectOption('3')
    await expect.poll(() => code(page)).toContain('.midichan(3)')
    await expect.poll(async () => (await sent()).some((bytes) => bytes[0] === 0x92)).toBe(true)

    // Stopping the song ends every note that sounds.
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await expect.poll(async () => (await sent()).some((bytes) => bytes[0] === 0xb2 && bytes[1] === 123)).toBe(true)

    // Played by the app again, the line is gone from the code.
    await played.selectOption({ label: 'Weft Loom' })
    await expect.poll(() => code(page)).not.toContain('midi')
})
