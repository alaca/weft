import { expect, test, type Locator, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n\nbass: note("c2 e2")\n  .s("sawtooth")\n\n_lead: note("c4 e4")\n'
const ALL = '1 1 1 1  1 1 1 1  1 1 1 1  1 1 1 1'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const now = (page: Page) => page.evaluate(() => (window as any).__weft.engine.now() as number)
const events = (page: Page, id: string, cycle: number) => page.evaluate(([name, at]) => (window as any).__weft.engine.events(name, at).length as number, [id, cycle] as const)
const song = (page: Page) => page.getByTestId('song')
const lane = (page: Page, id: string) => page.getByTestId(`lane-${id}`)
const bar = (page: Page, id: string, at: number) => lane(page, id).getByRole('button', { name: `${id} bar ${at}`, exact: true })
const pressed = (target: Locator) => target.getByRole('button', { pressed: true })

async function open(page: Page, text = SONG) {
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), text)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

async function drag(page: Page, id: string, from: number, to: number) {
    const a = (await bar(page, id, from).boundingBox())!
    const b = (await bar(page, id, to).boundingBox())!
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 })
    await page.mouse.up()
}

test('shows a lane for every pattern, sixteen bars long, with everything playing', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('song-length')).toHaveText('16 bars, 32 seconds')
    await expect(song(page).locator('.sg-n span')).toHaveText(['drums', 'bass', 'lead'])
    for (const id of ['drums', 'bass', 'lead']) {
        await expect(lane(page, id).getByRole('button')).toHaveCount(16)
        await expect(pressed(lane(page, id))).toHaveCount(16)
        await expect(lane(page, id).locator('.sg-c')).toHaveCount(1)
    }
    await expect(lane(page, 'lead')).toHaveClass(/muted/)
    await expect(lane(page, 'bass')).not.toHaveClass(/muted/)
    expect(await code(page)).toBe(SONG)
})

test('clicking a bar lets the pattern rest there, and clicking it again brings it back', async ({ page }) => {
    await open(page)
    await bar(page, 'bass', 3).click()
    await expect.poll(() => code(page)).toContain('bass: note("c2 e2")\n  .s("sawtooth")\n  .mask("<1 1 0 1  1 1 1 1  1 1 1 1  1 1 1 1>")\n')
    await expect(bar(page, 'bass', 3)).toHaveAttribute('aria-pressed', 'false')
    await expect(lane(page, 'bass').locator('.sg-c')).toHaveCount(2)
    await expect.poll(() => events(page, 'bass', 2)).toBe(0)
    await expect.poll(() => events(page, 'bass', 1)).toBe(2)
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')

    await bar(page, 'bass', 3).click()
    await expect.poll(() => code(page)).toBe(SONG)
    await expect.poll(() => events(page, 'bass', 2)).toBe(2)
})

test('dragging across bars changes them together', async ({ page }) => {
    await open(page)
    await drag(page, 'drums', 1, 4)
    await expect.poll(() => code(page)).toContain('  .bank("RolandTR909")\n  .mask("<0 0 0 0  1 1 1 1  1 1 1 1  1 1 1 1>")\n')
    await drag(page, 'drums', 3, 2)
    await expect.poll(() => code(page)).toContain('.mask("<0 1 1 0  1 1 1 1  1 1 1 1  1 1 1 1>")')
    await drag(page, 'drums', 16, 13)
    await expect.poll(() => code(page)).toContain('.mask("<0 1 1 0  1 1 1 1  1 1 1 1  0 0 0 0>")')
    await expect(lane(page, 'drums').locator('.sg-c')).toHaveCount(2)
})

test('a bar can be switched from the keyboard', async ({ page }) => {
    await open(page)
    await bar(page, 'bass', 2).focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => code(page)).toContain('.mask("<1 0 1 1  1 1 1 1  1 1 1 1  1 1 1 1>")')
    await expect(bar(page, 'bass', 2)).toBeFocused()
    await page.keyboard.press('Space')
    await expect.poll(() => code(page)).toBe(SONG)
})

test('a strip still draws its pattern when it rests in the first bar', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('strip-bass').locator('.nt')).toHaveCount(2)
    await bar(page, 'bass', 1).click()
    await expect.poll(() => events(page, 'bass', 0)).toBe(0)
    await expect(page.getByTestId('strip-bass').locator('.nt')).toHaveCount(2)
    await bar(page, 'drums', 1).click()
    await expect(page.getByTestId('strip-drums').locator('.pad.on')).toHaveCount(4)
})

test('the song can be made longer and shorter', async ({ page }) => {
    await open(page)
    await bar(page, 'bass', 3).click()
    await page.getByRole('button', { name: 'Song length 32 bars' }).click()
    await expect.poll(() => code(page)).toContain('.mask("<1 1 0 1  1 1 1 1  1 1 1 1  1 1 1 1  1 1 0 1  1 1 1 1  1 1 1 1  1 1 1 1>")')
    await expect(page.getByTestId('song-length')).toHaveText('32 bars, 64 seconds')
    await expect(lane(page, 'drums').getByRole('button')).toHaveCount(32)
    await expect(bar(page, 'bass', 19)).toHaveAttribute('aria-pressed', 'false')

    await page.getByRole('button', { name: 'Song length 8 bars' }).click()
    await expect.poll(() => code(page)).toContain('.mask("<1 1 0 1  1 1 1 1>")')
    await expect(lane(page, 'drums').getByRole('button')).toHaveCount(8)
    expect((await code(page)).match(/mask/g)).toHaveLength(1)
})

test('with nothing arranged, the length is only how much of the song is shown', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Song length 8 bars' }).click()
    await expect(lane(page, 'bass').getByRole('button')).toHaveCount(8)
    expect(await code(page)).toBe(SONG)
    await bar(page, 'bass', 8).click()
    await expect.poll(() => code(page)).toContain('.mask("<1 1 1 1  1 1 1 0>")')
})

test('reads bars written by hand, also the short way, and rewrites them in full', async ({ page }) => {
    await open(page, 'drums: s("bd*4").mask("<1!4 0!4>")\n\nbass: note("c2")\n')
    await expect(page.getByTestId('song-length')).toContainText('8 bars')
    await expect(pressed(lane(page, 'drums'))).toHaveCount(4)
    await expect(pressed(lane(page, 'bass'))).toHaveCount(8)
    await bar(page, 'drums', 5).click()
    await expect.poll(() => code(page)).toBe('drums: s("bd*4").mask("<1 1 1 1  1 0 0 0>")\n\nbass: note("c2")\n')
})

test('playing starts from the bar that was chosen', async ({ page }) => {
    await open(page)
    const five = page.getByRole('button', { name: 'Start from bar 5', exact: true })
    await five.click()
    await expect(five).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('cycle')).toHaveText('5')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect.poll(() => now(page)).toBeGreaterThan(4.05)
    expect(await now(page)).toBeLessThan(6)
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await expect(page.getByTestId('cycle')).toHaveText('5')
    await page.getByRole('button', { name: 'Start from bar 1', exact: true }).click()
    await expect(page.getByTestId('cycle')).toHaveText('1')
})

test('choosing a bar while the song plays jumps there', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(() => now(page)).toBeGreaterThan(0.1)
    await page.getByRole('button', { name: 'Start from bar 9', exact: true }).click()
    await expect.poll(() => now(page)).toBeGreaterThan(8)
    expect(await now(page)).toBeLessThan(10)
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect(song(page).locator('.sg-ph')).toHaveCount(1)
})

test('what plays follows the bars: a pattern is silent where it rests', async ({ page }) => {
    await open(page)
    await drag(page, 'bass', 1, 2)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    const sounds = (cycle: number) => page.evaluate((at) => ((window as any).__weft.engine.audible(at) as { sound: string }[]).map((event) => event.sound), cycle)
    expect(await sounds(0)).not.toContain('sawtooth')
    expect(await sounds(2)).toContain('sawtooth')
    await expect(page.getByTestId('strip-bass')).toHaveClass(/rest/)
    await expect(page.getByTestId('strip-drums')).not.toHaveClass(/rest/)
    await expect(page.getByTestId('strip-bass')).not.toHaveClass(/rest/, { timeout: 15_000 })
})

test('a control added to an arranged pattern goes before the line of bars', async ({ page }) => {
    await open(page)
    await bar(page, 'bass', 3).click()
    await page.getByRole('button', { name: 'Sound controls for bass', exact: true }).click()
    await page.getByTestId('sound-panel').getByRole('button', { name: 'Add Room' }).click()
    await expect.poll(() => code(page)).toContain('  .s("sawtooth")\n  .room(slider(0.3, 0, 1))\n  .mask("<1 1 0 1  1 1 1 1  1 1 1 1  1 1 1 1>")\n')
})

test('lanes follow the patterns of the song', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Remove the pattern bass', exact: true }).click()
    await expect(song(page).locator('.sg-n span')).toHaveText(['drums', 'lead'])
    await page.getByTestId('add-pattern').getByRole('button', { name: 'Melody', exact: true }).click()
    await expect(song(page).locator('.sg-n span')).toHaveText(['drums', 'lead', 'melody'])
    await expect(pressed(lane(page, 'melody'))).toHaveCount(16)
    await song(page).getByRole('button', { name: 'Go to drums', exact: true }).click()
    await expect(page.getByTestId('strip-drums')).toHaveClass(/sel/)
})

test('there is no song panel without patterns, and nothing in it works while the code has an error', async ({ page }) => {
    await open(page, '')
    await expect(song(page)).toHaveCount(0)
    await page.getByTestId('add-pattern').getByRole('button', { name: 'Drums', exact: true }).click()
    await expect(song(page)).toBeVisible()
    await page.evaluate(() => (window as any).__weft.engine.applyEdit({ from: 0, to: 0, insert: 'broken: s("bd"\n' }))
    await expect(bar(page, 'drums', 1)).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Song length 8 bars' })).toBeDisabled()
})
