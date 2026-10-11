import { expect, test, type Browser, type Page } from '@playwright/test'

const HH = 'x ~ x ~   x ~ x ~   x ~ x ~   x ~ x ~'
const SONG = `setcpm(120/4)\n\nperc: stack(\n  s("hh").struct("${HH}"),\n)\n  .bank("RolandTR909")\n\nbass: note("d2 ~ d2 f2").s("sawtooth").lpf(slider(1200, 200, 4000))\n`
const OTHER = 'setcpm(90/4)\n\nkeys: note("c3 e3 g3").s("triangle")\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const songName = (page: Page) => page.getByTestId('song-name')
const chat = (page: Page) => page.getByTestId('jam-chat')
const note = (page: Page) => page.getByTestId('jam-note')

// Each person is a browser of their own: their own songs, their own sounds, their own name.
async function person(browser: Browser, name: string, song: string): Promise<Page> {
    const context = await browser.newContext()
    const page = await context.newPage()
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

test('when both change the same thing at the same moment, one of the two stands, for both', async ({ browser }) => {
    const { ante, mara } = await jam(browser)
    const hat = (page: Page) => page.getByTestId('strip-perc').getByRole('button', { name: 'hh step 2', exact: true })
    const row = async (page: Page) => (await code(page)).match(/s\("hh"\)\.struct\("([^"]*)"\)/)?.[1] ?? ''
    for (let round = 0; round < 4; round++) {
        await Promise.all([hat(ante).click(), hat(mara).click()])
        await expect.poll(async () => (await code(ante)) === (await code(mara))).toBe(true)
        expect((await row(ante)).trim().split(/\s+/)).toHaveLength(16)
        await expect(hat(mara)).toBeEnabled()
    }
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

test('the one who joins is told what the other changed, and where', async ({ browser }) => {
    const { ante, mara } = await jam(browser)
    await ante.getByTestId('strip-perc').getByRole('button', { name: 'hh step 2', exact: true }).click()
    await expect(chat(mara)).toContainText('Ante changed perc')
    await expect(mara.getByTestId('strip-perc').getByTestId('jam-hand')).toHaveText('Ante')
    await expect(chat(ante)).not.toContainText('changed perc')
    await expect(ante.getByTestId('jam-hand')).toHaveCount(0)
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

test('an invite can be taken back, and a name is asked for first', async ({ browser }) => {
    const ante = await person(browser, '', SONG)
    await ante.getByRole('button', { name: 'Invite someone', exact: true }).click()
    await expect(note(ante)).toContainText('Type a name first')
    await ante.getByLabel('Your name').fill('Ante')
    await ante.getByLabel('Your name').blur()
    await expect(note(ante)).toHaveCount(0)
    const text = await invite(ante)
    await expect(ante.getByTestId('jams')).toContainText('Waiting for them to join Untitled.')
    await ante.getByRole('button', { name: 'Take the invite back', exact: true }).click()
    await expect(ante.getByRole('button', { name: 'Invite someone', exact: true })).toBeVisible()
    const mara = await person(browser, 'Mara', OTHER)
    await join(mara, text)
    await expect(note(mara)).toContainText('No jam is waiting under that invite.')
})

// Half a second of a plain tone as a 16 bit WAV file.
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

test('a knob one of them turns moves for the other, in the code and in the sound', async ({ browser }) => {
    const { ante, mara } = await jam(browser)
    const knob = ante.getByTestId('strip-bass').getByRole('slider', { name: 'Cutoff' })
    await knob.focus()
    for (let press = 0; press < 3; press++) await ante.keyboard.press('ArrowUp')
    const number = async (page: Page) => (await code(page)).match(/lpf\(slider\(([\d.]+)/)?.[1]
    await expect.poll(() => number(ante)).not.toBe('1200')
    await expect.poll(async () => (await number(mara)) === (await number(ante))).toBe(true)
    const inEditor = (page: Page) => page.locator('.cm-slider input').first().evaluate((input) => (input as HTMLInputElement & { originalValue: string }).originalValue)
    await expect.poll(async () => (await inEditor(mara)) === (await number(ante))).toBe(true)
})

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

test('a sound of theirs with the name of one of yours plays in its place, and gets a name of its own when the jam is over', async ({ browser }) => {
    const ante = await person(browser, 'Ante', SONG)
    const mara = await person(browser, 'Mara', OTHER)
    await addSound(ante, 'take', 330)
    await addSound(mara, 'take', 880)
    await type(ante, '\nvoc: s("take")')
    await join(mara, await invite(ante))
    await expect(chat(mara)).toContainText('Ante brought the sound take. You have one of that name, so theirs plays in its place while you jam.')
    await expect(yours(mara)).toHaveText(['take'])
    expect(await code(mara)).toContain('voc: s("take")')

    await mara.getByRole('button', { name: 'Leave', exact: true }).click()
    await expect.poll(() => code(mara)).toContain('voc: s("take_2")')
    await expect(yours(mara)).toHaveText(['take', 'take_2'])
    expect(await code(ante)).toContain('voc: s("take")')
    await expect(yours(ante)).toHaveText(['take'])
})

test('the same sound on both sides is not sent', async ({ browser }) => {
    const ante = await person(browser, 'Ante', SONG)
    const mara = await person(browser, 'Mara', OTHER)
    await addSound(ante, 'take', 330)
    await addSound(mara, 'take', 330)
    await type(ante, '\nvoc: s("take")')
    await join(mara, await invite(ante))
    await expect(mara.getByRole('heading', { name: 'Jam with Ante', exact: true })).toBeVisible()
    await mara.getByLabel('Message').fill('here')
    await mara.getByLabel('Message').press('Enter')
    await expect(chat(ante)).toContainText('here')
    await expect(chat(mara)).not.toContainText('brought the sound')
    await mara.getByRole('button', { name: 'Leave', exact: true }).click()
    await mara.waitForTimeout(300)
    expect(await code(mara)).toContain('voc: s("take")')
    await expect(yours(mara)).toHaveText(['take'])
})

test('someone who joins while the song plays hears it from where it is', async ({ browser }) => {
    const ante = await person(browser, 'Ante', SONG)
    const mara = await person(browser, 'Mara', OTHER)
    await mara.locator('body').click({ position: { x: 700, y: 880 } })
    await ante.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(() => now(ante)).toBeGreaterThan(2.2)
    await join(mara, await invite(ante))
    await expect(mara.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    await expect.poll(async () => Math.abs((await now(mara)) - (await now(ante)))).toBeLessThan(0.25)
    await ante.getByRole('button', { name: 'Pause', exact: true }).click()
    await expect(mara.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    const where = await now(ante)
    expect(Math.abs((await now(mara)) - where)).toBeLessThan(0.001)
    await mara.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(ante.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    await expect.poll(() => now(ante)).toBeGreaterThan(where + 0.3)
    expect(Math.abs((await now(mara)) - (await now(ante)))).toBeLessThan(0.25)
})

test('the bar a song starts from and the bars that go round are the same for both', async ({ browser }) => {
    const { ante, mara } = await jam(browser)
    await ante.getByRole('group', { name: 'What plays' }).getByRole('button', { name: 'Song', exact: true }).click()
    await expect(mara.getByRole('group', { name: 'What plays' }).getByRole('button', { name: 'Song', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await ante.getByRole('button', { name: 'Start from bar 3', exact: true }).click()
    await expect(mara.getByTestId('cycle')).toHaveText('3')
    await mara.getByRole('button', { name: 'Start from bar 2', exact: true }).click({ modifiers: ['Shift'] })
    await expect(ante.getByTestId('controls')).toContainText('Bars 2 to 3 go round')
    await ante.getByRole('button', { name: 'Stop going round', exact: true }).click()
    await expect(mara.getByTestId('controls')).not.toContainText('go round')
})

test('another song cannot be opened in the middle of a jam, and can after it', async ({ browser }) => {
    const { ante, mara } = await jam(browser)
    await songName(mara).click()
    const menu = mara.getByTestId('song-menu')
    const top = mara.getByTestId('top')
    await expect(mara.getByTestId('song-jam')).toContainText('You are in a jam with Ante on this song.')
    for (const what of ['New song', 'Open a file', 'Duplicate this song', 'Close song']) await expect(top.getByRole('button', { name: what, exact: true })).toBeDisabled()
    await expect(menu.getByRole('button', { name: 'Open Untitled', exact: true })).toBeDisabled()
    await mara.keyboard.press('Escape')
    await mara.getByRole('button', { name: 'Leave', exact: true }).click()
    await expect(top.getByRole('button', { name: 'New song', exact: true })).toBeEnabled()
    await songName(mara).click()
    await expect(mara.getByTestId('song-jam')).toHaveCount(0)
    await menu.getByRole('button', { name: 'Open Untitled', exact: true }).click()
    await expect.poll(() => code(mara)).toBe(OTHER)
    await expect(note(ante)).toContainText('Mara left the jam.')
})

test('the jam sits under the sounds, either is shown without the other, and the line between them can be dragged', async ({ browser }) => {
    const ante = await person(browser, 'Ante', SONG)
    const panel = ante.getByTestId('jams')
    const controls = ante.getByTestId('controls')
    const box = async (target: ReturnType<Page['getByTestId']>) => (await target.boundingBox())!
    expect(Math.round((await box(panel)).width)).toBe(340)
    expect(Math.round((await box(panel)).height)).toBe(Math.round((await box(controls)).height))
    expect(Math.round((await box(controls)).x)).toBe(340)

    await ante.getByRole('button', { name: 'Sounds', exact: true }).click()
    const above = await box(sounds(ante))
    const below = await box(panel)
    expect(Math.round(above.y + above.height)).toBe(Math.round(below.y))
    expect(Math.round(above.height / (above.height + below.height) * 100)).toBe(40)
    expect(Math.round(above.width)).toBe(340)

    const line = ante.getByRole('separator', { name: 'Height of the sounds' })
    const at = await box(line as never)
    const grip = at.y + at.height / 2
    await ante.mouse.move(170, grip)
    await ante.mouse.down()
    await ante.mouse.move(170, grip + 60, { steps: 4 })
    await ante.mouse.move(170, grip + 120, { steps: 4 })
    await ante.mouse.up()
    const taller = await box(sounds(ante))
    expect(Math.abs(taller.height - above.height - 120)).toBeLessThanOrEqual(1)

    await ante.reload()
    await ante.waitForFunction(() => Boolean((window as any).__weft))
    expect(Math.abs((await box(sounds(ante))).height - taller.height)).toBeLessThanOrEqual(1)
    await expect(ante.getByTestId('jams')).toBeVisible()

    await line.dblclick()
    expect(Math.round((await box(sounds(ante))).height)).toBe(Math.round(above.height))
    await ante.getByRole('button', { name: 'Close jams', exact: true }).click()
    await expect(ante.getByTestId('jams')).toHaveCount(0)
    expect(Math.round((await box(sounds(ante))).height)).toBe(Math.round((await box(controls)).height))
    await ante.getByRole('button', { name: 'Reset layout', exact: true }).click()
    await expect(sounds(ante)).toHaveCount(0)
    expect(Math.round((await box(controls)).x)).toBe(0)
})
