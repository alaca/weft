import { expect, test, type Browser, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\nperc: s("hh*8").bank("RolandTR909")\n\nbass: note("d2 ~ d2 f2").s("sawtooth")\n'
const OTHER = 'setcpm(90/4)\n\nkeys: note("c3 e3 g3").s("triangle")\n'
// The list is the same for every test that runs at this moment, so each person here has a name
// nobody else has, and a row is found by it.
const LOOK = { timeout: 15000 }

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const note = (page: Page) => page.getByTestId('jam-note')
const list = (page: Page) => page.getByTestId('open-jams')
const row = (page: Page, name: string) => list(page).getByTestId('open-jam').filter({ hasText: name })
const card = (page: Page) => page.getByTestId('jam-ask')
const listed = (page: Page) => page.getByRole('switch', { name: /Open to jam/ })
const called = (name: string) => `${name} ${Math.random().toString(36).slice(2, 8)}`
// What the relay itself says is in the list at this moment.
const onList = async (page: Page, name: string) => ((await (await page.request.get('http://127.0.0.1:5190/jams')).json()) as { jams: { name: string }[] }).jams.some((jam) => jam.name === name)

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

// The card of the one who asked. The list is open to every window on this machine, so someone
// else may have asked first; they are told not now.
async function asked(page: Page, name: string) {
    await expect(async () => {
        const text = (await card(page).textContent({ timeout: 2000 })) ?? ''
        if (text.includes(`${name} asks to join your song`)) return
        await card(page).getByRole('button', { name: 'Not now', exact: true }).click({ timeout: 2000 })
        throw new Error('someone else asked first')
    }).toPass(LOOK)
    return card(page)
}

// One person who is open to jam and another who reads the list.
async function two(browser: Browser) {
    const ante = called('Ante')
    const mara = called('Mara')
    const host = await person(browser, ante, SONG)
    const asker = await person(browser, mara, OTHER)
    await listed(host).click()
    await expect(listed(host)).toHaveAttribute('aria-checked', 'true')
    await expect(row(asker, ante)).toBeVisible(LOOK)
    return { host, asker, ante, mara }
}

test.afterEach(async ({ browser }) => {
    for (const context of browser.contexts()) await context.close()
})

test('a jam is in the list for everyone while its switch is on, with the size of its song and nothing else', async ({ browser }) => {
    const ante = called('Ante')
    const host = await person(browser, ante, SONG)
    const reader = await person(browser, called('Mara'), OTHER)
    await expect(listed(host)).toHaveAttribute('aria-checked', 'false')
    await host.getByRole('button', { name: 'Invite someone', exact: true }).click()
    await expect(host.getByTestId('jam-invite')).toBeVisible()
    expect(await onList(reader, ante)).toBe(false)

    await listed(host).click()
    await expect(listed(host)).toHaveAttribute('aria-checked', 'true')
    await expect(row(reader, ante)).toContainText('120 bpm, 2 patterns', LOOK)
    await expect(row(host, ante)).toHaveCount(0)
    await expect(host.getByTestId('jams')).toContainText('It works once, listed or not.')
    const invite = (await host.getByTestId('jam-invite').textContent())!.trim()
    await expect(list(reader)).not.toContainText(invite)

    await host.locator('.cm-content').click()
    await host.keyboard.press('ControlOrMeta+End')
    await host.keyboard.type('\nlead: note("a4").s("sine")')
    await expect(row(reader, ante)).toContainText('120 bpm, 3 patterns', LOOK)

    await listed(host).click()
    await expect(listed(host)).toHaveAttribute('aria-checked', 'false')
    await expect(row(reader, ante)).toHaveCount(0, LOOK)
    expect(await onList(reader, ante)).toBe(false)
    await expect(host.getByTestId('jam-invite')).toHaveText(invite)
})

test('someone in the list is asked, lets the other in, and both are on their song', async ({ browser }) => {
    const { host, asker, ante, mara } = await two(browser)
    await row(asker, ante).getByRole('button', { name: `Ask to join ${ante}`, exact: true }).click()
    await expect(row(asker, ante)).toContainText('Asked.')
    await expect(await asked(host, mara)).toContainText('They will see Untitled and can change it with you.')
    expect(await code(asker)).toBe(OTHER)

    await card(host).getByRole('button', { name: 'Let them in', exact: true }).click()
    await expect(host.getByRole('heading', { name: `Jam with ${mara}`, exact: true })).toBeVisible()
    await expect(asker.getByRole('heading', { name: `Jam with ${ante}`, exact: true })).toBeVisible()
    await expect(card(host)).toHaveCount(0)
    expect(await code(asker)).toBe(SONG)
    await expect(host.getByTestId('jam-chat')).toContainText(`${mara} joined. You are both on Untitled.`)

    await asker.getByLabel('Message').fill('hello')
    await asker.getByLabel('Message').press('Enter')
    await expect(host.getByTestId('jam-chat')).toContainText('hello')

    expect(await onList(host, ante)).toBe(false)
    await expect(row(asker, ante)).toHaveCount(0)
})

test('not now is told to the one who asked, and the jam stays open for others', async ({ browser }) => {
    const { host, asker, ante, mara } = await two(browser)
    await row(asker, ante).getByRole('button', { name: `Ask to join ${ante}`, exact: true }).click()
    await (await asked(host, mara)).getByRole('button', { name: 'Not now', exact: true }).click()
    await expect(card(host)).toHaveCount(0)
    await expect(note(asker)).toContainText(`${ante} did not let you in this time. Ask someone else in the list, or send an invite to someone you know.`)
    await expect(row(asker, ante)).toContainText('Not now')
    await expect(row(asker, ante).getByRole('button')).toHaveCount(0)
    await expect(listed(host)).toHaveAttribute('aria-checked', 'true')
    expect(await code(asker)).toBe(OTHER)

    const tomo = called('Tomo')
    const third = await person(browser, tomo, OTHER)
    await row(third, ante).getByRole('button', { name: `Ask to join ${ante}`, exact: true }).click(LOOK)
    await asked(host, tomo)
})

test('a question can be taken back, and goes away for the one who was asked', async ({ browser }) => {
    const { host, asker, ante, mara } = await two(browser)
    await row(asker, ante).getByRole('button', { name: `Ask to join ${ante}`, exact: true }).click()
    await asked(host, mara)
    await expect(asker.getByLabel('Your name')).toBeDisabled()
    await row(asker, ante).getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(card(host)).toHaveCount(0)
    await expect(row(asker, ante).getByRole('button', { name: `Ask to join ${ante}`, exact: true })).toBeEnabled()
    await expect(asker.getByLabel('Your name')).toBeEnabled()
})

test('someone who was blocked gets no second question through, under any name', async ({ browser }) => {
    const { host, asker, ante, mara } = await two(browser)
    await row(asker, ante).getByRole('button', { name: `Ask to join ${ante}`, exact: true }).click()
    await (await asked(host, mara)).getByRole('button', { name: 'Block', exact: true }).click()
    await expect(note(asker)).toContainText(`${ante} did not let you in this time.`)

    const again = await person(browser, called('Nobody'), OTHER)
    await row(again, ante).getByRole('button', { name: `Ask to join ${ante}`, exact: true }).click(LOOK)
    await expect(note(again)).toContainText(`${ante} did not let you in this time.`)
    await expect(card(host)).toHaveCount(0)
    await expect(listed(host)).toHaveAttribute('aria-checked', 'true')
})

test('two people ask one after the other, and letting the first in tells the second the jam is taken', async ({ browser }) => {
    const { host, asker, ante, mara } = await two(browser)
    const tomo = called('Tomo')
    const third = await person(browser, tomo, OTHER)
    await row(asker, ante).getByRole('button', { name: `Ask to join ${ante}`, exact: true }).click()
    await asked(host, mara)
    await row(third, ante).getByRole('button', { name: `Ask to join ${ante}`, exact: true }).click(LOOK)
    await expect(card(host)).toContainText('One more person is asking.')
    await card(host).getByRole('button', { name: 'Let them in', exact: true }).click()
    await expect(host.getByRole('heading', { name: `Jam with ${mara}`, exact: true })).toBeVisible()
    await expect(note(third)).toContainText(`${ante} is no longer open to jam`)
    expect(await code(third)).toBe(OTHER)
})

test('someone who waits in a jam of their own can ask too, and is on the other song once let in', async ({ browser }) => {
    const { host, asker, ante, mara } = await two(browser)
    await listed(asker).click()
    await expect(listed(asker)).toHaveAttribute('aria-checked', 'true')
    await expect(row(host, mara)).toBeVisible(LOOK)
    await row(asker, ante).getByRole('button', { name: `Ask to join ${ante}`, exact: true }).click()
    await expect(asker.getByTestId('jam-invite')).toBeVisible()
    await (await asked(host, mara)).getByRole('button', { name: 'Let them in', exact: true }).click()
    await expect(asker.getByRole('heading', { name: `Jam with ${ante}`, exact: true })).toBeVisible()
    expect(await code(asker)).toBe(SONG)
    expect(await code(host)).toBe(SONG)
    expect(await onList(host, mara)).toBe(false)
    expect(await onList(host, ante)).toBe(false)
})

test('closing the song takes you off the list, and a name is asked for before you are on it', async ({ browser }) => {
    const host = await person(browser, '', SONG)
    await listed(host).click()
    await expect(note(host)).toContainText('Type a name first')
    await expect(listed(host)).toHaveAttribute('aria-checked', 'false')
    const ante = called('Ante')
    await host.getByLabel('Your name').fill(ante)
    await host.getByLabel('Your name').blur()
    await listed(host).click()
    await expect(listed(host)).toHaveAttribute('aria-checked', 'true')
    const reader = await person(browser, called('Mara'), OTHER)
    await expect(row(reader, ante)).toBeVisible(LOOK)
    await host.getByTestId('song-name').click()
    await host.getByRole('button', { name: 'Close song', exact: true }).click()
    await expect.poll(() => onList(reader, ante)).toBe(false)
    await expect(row(reader, ante)).toHaveCount(0, LOOK)
})
