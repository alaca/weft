import { expect, test, type Browser, type Page } from '@playwright/test'

const HH = 'x ~ x ~   x ~ x ~   x ~ x ~   x ~ x ~'
const SONG = `setcpm(120/4)\n\nperc: stack(\n  s("hh").struct("${HH}"),\n)\n  .bank("RolandTR909")\n\nbass: note("d2 ~ d2 f2").s("sawtooth").lpf(slider(1200, 200, 4000))\n`
const OTHER = 'setcpm(90/4)\n\nkeys: note("c3 e3 g3").s("triangle")\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const songName = (page: Page) => page.getByTestId('song-name')
const chat = (page: Page) => page.getByTestId('jam-chat')
const note = (page: Page) => page.getByTestId('jam-note')

// Each person is a browser of their own: their own songs, their own sounds, their own name.
async function person(browser: Browser, name: string, song: string, first?: (page: Page) => Promise<unknown>): Promise<Page> {
    const context = await browser.newContext()
    const page = await context.newPage()
    await first?.(page)
    await page.addInitScript((text) => {
        if (!sessionStorage.getItem('seeded')) {
            localStorage.setItem('weft.song', text)
            sessionStorage.setItem('seeded', '1')
        }
    }, song)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await page.getByRole('button', { name: 'Jams', exact: true }).click()
    await page.getByLabel('Your name').fill(name)
    await page.getByLabel('Your name').blur()
    return page
}

async function invite(host: Page): Promise<string> {
    await host.getByRole('button', { name: 'Invite someone', exact: true }).click()
    const text = (await host.getByTestId('jam-invite').textContent())!.trim()
    expect(text).toMatch(/^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/)
    return text
}

async function join(guest: Page, text: string) {
    await guest.getByLabel('Invite', { exact: true }).fill(text)
    await guest.getByRole('button', { name: 'Join', exact: true }).click()
}

async function jam(browser: Browser) {
    const ante = await person(browser, 'Ante', SONG)
    const mara = await person(browser, 'Mara', OTHER)
    await join(mara, await invite(ante))
    await expect(ante.getByRole('heading', { name: 'Jam with Mara', exact: true })).toBeVisible()
    await expect(mara.getByRole('heading', { name: 'Jam with Ante', exact: true })).toBeVisible()
    return { ante, mara }
}

test.afterEach(async ({ browser }) => {
    for (const context of browser.contexts()) await context.close()
})

test('an invite brings a second person onto the song of the one who made it', async ({ browser }) => {
    const { ante, mara } = await jam(browser)
    expect(await code(mara)).toBe(SONG)
    await expect(songName(mara)).toContainText('Untitled')
    await expect(chat(ante)).toContainText('Mara joined. You are both on Untitled.')
    await expect(chat(mara)).toContainText('You joined Ante. You are both on Untitled')
    await expect(ante.getByTestId('jam-with')).toHaveText('With Mara')
    await expect(mara.getByTestId('jam-with')).toHaveText('With Ante')
    await expect(mara.getByTestId('strip-perc')).toBeVisible()
    await expect(mara.getByTestId('strip-keys')).toHaveCount(0)
})

test('what one changes with a control or in the code, the other gets', async ({ browser }) => {
    const { ante, mara } = await jam(browser)
    await ante.getByTestId('strip-perc').getByRole('button', { name: 'hh step 2', exact: true }).click()
    await expect.poll(() => code(mara)).toContain('s("hh").struct("x x x ~   x ~ x ~   x ~ x ~   x ~ x ~")')
    await expect(mara.getByTestId('strip-perc').getByRole('button', { name: 'hh step 2', exact: true })).toHaveAttribute('aria-pressed', 'true')

    await mara.getByTestId('strip-perc').getByRole('button', { name: 'hh step 4', exact: true }).click()
    await expect.poll(() => code(ante)).toContain('s("hh").struct("x x x x   x ~ x ~   x ~ x ~   x ~ x ~")')
    await expect(ante.getByTestId('strip-perc').getByRole('button', { name: 'hh step 4', exact: true })).toHaveAttribute('aria-pressed', 'true')

    await ante.locator('.cm-content').click()
    await ante.keyboard.press('ControlOrMeta+End')
    await ante.keyboard.type('\nlead: note("a4").s("sine")')
    await expect.poll(() => code(mara)).toContain('lead: note("a4").s("sine")')
    expect(await code(mara)).toBe(await code(ante))
    await expect(mara.getByTestId('strip-lead')).toBeVisible()
})

test('changes made by both at the same moment end as the same code for both', async ({ browser }) => {
    const { ante, mara } = await jam(browser)
    const hat = (page: Page, step: number) => page.getByTestId('strip-perc').getByRole('button', { name: `hh step ${step}`, exact: true })
    const press = async (page: Page, steps: number[]) => {
        for (const step of steps) await hat(page, step).click()
    }
    await Promise.all([press(ante, [2, 6]), press(mara, [16, 12])])
    await expect.poll(async () => (await code(ante)) === (await code(mara))).toBe(true)
    await expect.poll(() => code(ante)).toContain('s("hh").struct("x x x ~   x x x ~   x ~ x x   x ~ x x")')
})

test('what one says, the other reads', async ({ browser }) => {
    const { ante, mara } = await jam(browser)
    await mara.getByLabel('Message').fill('can I try busier hats?')
    await mara.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(chat(ante)).toContainText('Mara')
    await expect(chat(ante)).toContainText('can I try busier hats?')
    await expect(chat(mara)).toContainText('can I try busier hats?')
    await ante.getByLabel('Message').fill('go for it')
    await ante.getByLabel('Message').press('Enter')
    await expect(chat(mara)).toContainText('go for it')
    await expect(ante.getByLabel('Message')).toHaveValue('')

    await mara.getByRole('button', { name: 'Jams', exact: true }).click()
    await expect(mara.getByTestId('jams')).toHaveCount(0)
    await ante.getByLabel('Message').fill('still there?')
    await ante.getByLabel('Message').press('Enter')
    await ante.getByLabel('Message').fill('hello?')
    await ante.getByLabel('Message').press('Enter')
    await expect(mara.getByTestId('jam-with')).toHaveText('With Ante2')
    await mara.getByTestId('jam-with').click()
    await expect(chat(mara)).toContainText('still there?')
    await expect(mara.getByTestId('jam-with')).toHaveText('With Ante')
})

test('the song starts, stops and changes mode for both', async ({ browser }) => {
    const { ante, mara } = await jam(browser)
    await ante.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(mara.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    await expect(ante.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    await mara.getByRole('button', { name: 'Stop', exact: true }).click()
    await expect(ante.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    await expect(mara.getByRole('button', { name: 'Play', exact: true })).toBeVisible()

    const mode = (page: Page, name: string) => page.getByRole('group', { name: 'What plays' }).getByRole('button', { name, exact: true })
    await expect(mode(mara, 'Live')).toHaveAttribute('aria-pressed', 'true')
    await ante.getByRole('group', { name: 'What plays' }).getByRole('button', { name: 'Song', exact: true }).click()
    await expect(mode(mara, 'Song')).toHaveAttribute('aria-pressed', 'true')
})

test('leaving ends the jam for both, and each keeps the song', async ({ browser }) => {
    const { ante, mara } = await jam(browser)
    await mara.getByTestId('strip-perc').getByRole('button', { name: 'hh step 2', exact: true }).click()
    await expect.poll(() => code(ante)).toContain('x x x ~   x ~ x ~')
    await mara.getByRole('button', { name: 'Leave', exact: true }).click()
    await expect(mara.getByRole('heading', { name: 'Jams', exact: true })).toBeVisible()
    await expect(note(mara)).toContainText('You left the jam with Ante.')
    await expect(note(ante)).toContainText('Mara left the jam.')
    await expect(ante.getByTestId('jam-with')).toHaveCount(0)

    await ante.getByTestId('strip-perc').getByRole('button', { name: 'hh step 4', exact: true }).click()
    await expect.poll(() => code(ante)).toContain('x x x x   x ~ x ~')
    await mara.waitForTimeout(300)
    expect(await code(mara)).toContain('x x x ~   x ~ x ~')

    await mara.reload()
    await mara.waitForFunction(() => Boolean((window as any).__weft))
    expect(await code(mara)).toContain('x x x ~   x ~ x ~')
    await songName(mara).click()
    await expect(mara.getByTestId('your-songs')).toContainText('Untitled 2')
})

test('an invite works once, and a wrong one says so', async ({ browser }) => {
    const ante = await person(browser, 'Ante', SONG)
    const mara = await person(browser, 'Mara', OTHER)
    const tomo = await person(browser, 'Tomo', OTHER)
    const text = await invite(ante)
    await join(mara, text.toLowerCase().replace('-', ' '))
    await expect(mara.getByRole('heading', { name: 'Jam with Ante', exact: true })).toBeVisible()
    await join(tomo, text)
    await expect(note(tomo)).toContainText('No jam is waiting under that invite.')
    await expect(tomo.getByRole('heading', { name: 'Jams', exact: true })).toBeVisible()
    await join(tomo, 'hello')
    await expect(note(tomo)).toContainText('That is not an invite.')
    expect(await code(tomo)).toBe(OTHER)
})

// Half a second of a plain tone as a 16 bit WAV file.
// Someone whose line to the relay can be cut and kept down, the way a network does it: both
// ends of it are closed, and no new one gets through until it is mended.
async function fragile(browser: Browser, name: string, song: string) {
    let down = false
    const lines: { close(): Promise<void> }[] = []
    const page = await person(browser, name, song, (made) =>
        made.routeWebSocket(/:5190/, (line) => {
            if (down) return void line.close()
            lines.push(line, line.connectToServer())
        }),
    )
    return {
        page,
        async cut() {
            down = true
            for (const line of lines.splice(0)) await line.close().catch(() => undefined)
        },
        mend: () => void (down = false),
    }
}

const lineNote = (page: Page) => page.getByTestId('jam-line')

test('a line that drops in the middle of a jam comes back by itself, and each gets what the other changed and said meanwhile', async ({ browser }) => {
    const ante = await person(browser, 'Ante', SONG)
    const line = await fragile(browser, 'Mara', OTHER)
    const mara = line.page
    await join(mara, await invite(ante))
    await expect(mara.getByRole('heading', { name: 'Jam with Ante', exact: true })).toBeVisible()
    const hat = (page: Page, step: number) => page.getByTestId('strip-perc').getByRole('button', { name: `hh step ${step}`, exact: true })
    await hat(ante, 2).click()
    await expect.poll(() => code(mara)).toContain('"x x x ~   x ~ x ~   x ~ x ~   x ~ x ~"')

    await line.cut()
    await expect(lineNote(mara)).toContainText('The line was lost. Getting back into the jam.')
    await expect(lineNote(ante)).toContainText('Mara lost the line. Their place is kept for two minutes')
    await expect(chat(ante)).toContainText('Mara lost the line.')
    await expect(mara.getByRole('heading', { name: 'Jam with Ante', exact: true })).toBeVisible()

    // Both go on working, and talking, while the line is down.
    await hat(ante, 4).click()
    await hat(mara, 16).click()
    await mara.getByLabel('Message').fill('are you still there?')
    await mara.getByLabel('Message').press('Enter')
    await ante.getByLabel('Message').fill('waiting for you')
    await ante.getByLabel('Message').press('Enter')
    expect(await code(ante)).not.toBe(await code(mara))

    line.mend()
    await expect(lineNote(mara)).toHaveCount(0)
    await expect(lineNote(ante)).toHaveCount(0)
    await expect(chat(mara)).toContainText('You are back in the jam.')
    await expect(chat(ante)).toContainText('Mara is back.')
    await expect.poll(() => code(ante)).toContain('"x x x x   x ~ x ~   x ~ x ~   x ~ x x"')
    await expect.poll(async () => (await code(ante)) === (await code(mara))).toBe(true)
    await expect(chat(ante)).toContainText('are you still there?')
    await expect(chat(mara)).toContainText('waiting for you')

    // And the jam is whole again: what either does now reaches the other as before.
    await hat(mara, 6).click()
    await expect.poll(() => code(ante)).toContain('"x x x x   x x x ~   x ~ x ~   x ~ x x"')
    await hat(ante, 8).click()
    await expect.poll(() => code(mara)).toContain('"x x x x   x x x x   x ~ x ~   x ~ x x"')
})

test('closing the window leaves the jam at once, and the other is not kept waiting', async ({ browser }) => {
    const { ante, mara } = await jam(browser)
    await mara.close({ runBeforeUnload: true })
    await expect(note(ante)).toHaveText('Mara left the jam. Untitled stays with your songs as it is now.')
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

const sounds = (page: Page) => page.getByTestId('sound-browser')
const now = (page: Page) => page.evaluate(() => (window as any).__weft.engine.now() as number)

async function addSound(page: Page, name: string, hertz: number) {
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    if (!(await sounds(page).count())) await page.getByRole('button', { name: 'Sounds', exact: true }).click()
    await sounds(page).getByRole('radio', { name: /^Yours/ }).click()
    await page.getByTestId('own-files').setInputFiles([{ name: `${name}.wav`, mimeType: 'audio/wav', buffer: tone(hertz) }])
    await expect(sounds(page).locator('.sb-i code').filter({ hasText: new RegExp(`^${name}$`) })).toHaveCount(1)
}

const yours = (page: Page) => sounds(page).locator('.sb-i code')

async function type(page: Page, text: string) {
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type(text)
}

test('a sound of your own that the song uses goes to the other person, at the start and later', async ({ browser }) => {
    const ante = await person(browser, 'Ante', SONG)
    const mara = await person(browser, 'Mara', OTHER)
    await addSound(ante, 'take', 330)
    await type(ante, '\nvoc: s("take")')
    await expect(mara.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    await join(mara, await invite(ante))
    await expect(chat(mara)).toContainText('Ante brought the sound take. It is now among yours.')
    await mara.getByRole('button', { name: 'Sounds', exact: true }).click()
    await sounds(mara).getByRole('radio', { name: /^Yours/ }).click()
    await expect(yours(mara)).toHaveText(['take'])

    await addSound(mara, 'clap_mine', 550)
    await type(mara, '\nextra: s("clap_mine")')
    await expect(chat(ante)).toContainText('Mara brought the sound clap_mine. It is now among yours.')
    await expect(yours(ante)).toHaveText(['clap_mine', 'take'])
    await expect(chat(mara)).not.toContainText('brought the sound clap_mine')

    await mara.reload()
    await mara.waitForFunction(() => Boolean((window as any).__weft))
    await expect(mara.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    await sounds(mara).getByRole('radio', { name: /^Yours/ }).click()
    await expect(yours(mara)).toHaveText(['clap_mine', 'take'])
})
