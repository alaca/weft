import { expect, test, type Locator, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n\nbass: note("c2 e2")\n  .s("sawtooth")\n\n_lead: note("c4 e4")\n'

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
    // These are about the song as it is arranged. A song with no bars written yet opens in
    // Live, where the bars are not followed, so Song is chosen first.
    await page.getByRole('group', { name: 'What plays' }).getByRole('button', { name: 'Song', exact: true }).click()
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
        await expect(lane(page, id)).toHaveAttribute('data-bars', '16')
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
    await expect.poll(() => code(page)).toContain('bass: note("c2 e2")\n  .s("sawtooth")\n  .mask("<1!2 0 1!13>")\n')
    await expect(bar(page, 'bass', 3)).toHaveAttribute('aria-pressed', 'false')
    await expect(lane(page, 'bass').locator('.sg-c')).toHaveCount(2)
    await expect.poll(() => events(page, 'bass', 2)).toBe(0)
    await expect.poll(() => events(page, 'bass', 1)).toBe(2)
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')

    await bar(page, 'bass', 3).click()
    await expect.poll(() => code(page)).toBe(SONG)
    await expect.poll(() => events(page, 'bass', 2)).toBe(2)
})

test('filling a bar past the end makes the song longer, and the other patterns rest there', async ({ page }) => {
    await open(page)
    await bar(page, 'bass', 20).click()
    await expect
        .poll(() => code(page))
        .toBe(
            'setcpm(120/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n  .mask("<1!16 0!4>")\n\nbass: note("c2 e2")\n  .s("sawtooth")\n  .mask("<1!16 0!3 1>")\n\n_lead: note("c4 e4")\n  .mask("<1!16 0!4>")\n',
        )
    await expect(page.getByTestId('song-length')).toHaveText('20 bars, 40 seconds')
    await expect(lane(page, 'drums')).toHaveAttribute('data-bars', '20')
    await expect(pressed(lane(page, 'drums'))).toHaveCount(16)
    await expect(pressed(lane(page, 'bass'))).toHaveCount(17)
    await expect.poll(() => events(page, 'drums', 19)).toBe(0)
    await expect.poll(() => events(page, 'bass', 19)).toBe(2)
    await expect(page.getByRole('button', { name: 'Start from bar 20', exact: true })).toBeEnabled()
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
    // Stop goes back to the beginning of the song, and the next Play starts there.
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await expect(page.getByTestId('cycle')).toHaveText('1')
    await expect(page.getByRole('button', { name: 'Start from bar 1', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(five).toHaveAttribute('aria-pressed', 'false')
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

const sounding = (page: Page, cycle: number) => page.evaluate((at) => (window as any).__weft.engine.audible(at).length as number, cycle)

test('an arranged song stops at its end and goes back to the start', async ({ page }) => {
    await open(page, 'setcpm(480/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n  .mask("<0 1!3>")\n\nbass: note("c2 e2")\n  .s("sawtooth")\n')
    await expect(page.getByTestId('song-length')).toContainText('4 bars')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    expect(await sounding(page, 3)).toBeGreaterThan(0)
    expect(await sounding(page, 4)).toBe(0)
    await expect(page.getByTestId('code-status')).toHaveText('Stopped', { timeout: 8000 })
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    await expect(page.getByTestId('cycle')).toHaveText('1')
    expect(await now(page)).toBe(0)

    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await drag(page, 'bass', 5, 8)
    await expect(page.getByTestId('song-length')).toContainText('8 bars')
    await expect.poll(() => now(page)).toBeGreaterThan(4.5)
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect(page.getByTestId('code-status')).toHaveText('Stopped', { timeout: 8000 })
})

const number = (page: Page, at: number) => page.getByRole('button', { name: `Start from bar ${at}`, exact: true })

async function dragNumbers(page: Page, from: number, to: number) {
    const a = (await number(page, from).boundingBox())!
    const b = (await number(page, to).boundingBox())!
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move((a.x + b.x) / 2 + 5, a.y + a.height / 2, { steps: 4 })
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 })
    await page.mouse.up()
}

test('dragging across bar numbers makes those bars go round', async ({ page }) => {
    await open(page, 'setcpm(960/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n  .mask("<1!8>")\n\nbass: note("c2 e2")\n  .s("sawtooth")\n')
    await dragNumbers(page, 3, 4)
    await expect(page.getByTestId('loop')).toContainText('Bars 3 to 4 go round')
    await expect(page.getByTestId('loop-band')).toBeVisible()
    await expect(page.getByTestId('cycle')).toHaveText('3')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    const seen = new Set<number>()
    for (let look = 0; look < 30; look++) {
        seen.add(Math.floor(await now(page)))
        await page.waitForTimeout(100)
    }
    expect([...seen].sort()).toEqual([2, 3])
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')

    await page.getByRole('button', { name: 'Stop going round', exact: true }).click()
    await expect(page.getByTestId('loop')).toHaveCount(0)
    await expect.poll(() => now(page)).toBeGreaterThan(5)
    await expect(page.getByTestId('code-status')).toHaveText('Stopped', { timeout: 8000 })
})

test('a bar number clicked while bars go round makes the song play on from that bar', async ({ page }) => {
    // The bass plays a note of its own in every bar, so the note that sounds says which bar it is.
    const notes = Array.from({ length: 24 }, (_, at) => 24 + at).join(' ')
    await open(page, `setcpm(120/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n  .mask("<1!24>")\n\nbass: note("<${notes}>")\n  .s("sawtooth")\n`)
    await dragNumbers(page, 9, 12)
    await expect(page.getByTestId('loop')).toContainText('Bars 9 to 12 go round')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(() => now(page)).toBeGreaterThan(8.2)
    await number(page, 21).click()
    await expect(page.getByTestId('loop')).toHaveCount(0)
    await expect.poll(() => now(page)).toBeGreaterThanOrEqual(20)
    // How many bars lie between the bar that sounds and the bar the playhead is in.
    const apart = () =>
        page.evaluate(() => {
            const engine = (window as any).__weft.engine
            const shown = Math.floor(engine.now())
            const bass = (engine.audible(shown) as { sound: string; midi: number }[]).filter((event) => event.sound === 'sawtooth')
            return bass.map((event) => event.midi - 24 - shown)
        })
    await expect.poll(apart).toEqual([0])
})

test('the bars that go round can be put in once more, have empty bars put in before them, and be taken out, in every pattern', async ({ page }) => {
    await open(page, 'setcpm(120/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n  .mask("<1!2 0!2 1!4>")\n\nbass: note("c2 e2")\n  .s("sawtooth")\n  .mask("<0!3 1!5>")\n\nlead: note("c4")\n')
    await dragNumbers(page, 3, 4)
    await page.getByTestId('loop').getByRole('button', { name: 'Repeat them', exact: true }).click()
    await expect.poll(() => code(page)).toContain('.mask("<1!2 0!4 1!4>")')
    expect(await code(page)).toContain('.mask("<0!3 1 0 1!5>")')
    expect(await code(page)).toContain('lead: note("c4")\n')
    await expect(page.getByTestId('song-length')).toContainText('10 bars')
    await expect(page.getByTestId('loop')).toContainText('Bars 5 to 6 go round')

    // Empty bars are put in before them, and are then the ones that go round.
    await page.getByTestId('loop').getByRole('button', { name: 'Empty bars before', exact: true }).click()
    await expect.poll(() => code(page)).toContain('.mask("<1!2 0!6 1!4>")')
    expect(await code(page)).toContain('.mask("<0!3 1 0!3 1!5>")')
    await expect(page.getByTestId('song-length')).toContainText('12 bars')
    await expect(page.getByTestId('loop')).toContainText('Bars 5 to 6 go round')

    // And taken out again, with which nothing goes round any more.
    await page.getByTestId('loop').getByRole('button', { name: 'Take them out', exact: true }).click()
    await expect.poll(() => code(page)).toContain('.mask("<1!2 0!4 1!4>")')
    expect(await code(page)).toContain('.mask("<0!3 1 0 1!5>")')
    await expect(page.getByTestId('song-length')).toContainText('10 bars')
    await expect(page.getByTestId('loop')).toHaveCount(0)
})

test('a pattern is muted, played alone, turned up and moved to a side from its row in the song', async ({ page }) => {
    await open(page)
    const rows = song(page)
    const strip = page.getByTestId('strip-bass')

    await rows.getByRole('button', { name: 'Mute bass', exact: true }).click()
    await expect.poll(() => code(page)).toContain('_bass: note(')
    await expect(rows.getByRole('button', { name: 'Mute bass', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(strip.getByRole('button', { name: 'Mute bass', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await strip.getByRole('button', { name: 'Mute bass', exact: true }).click()
    await expect.poll(() => code(page)).not.toContain('_bass')
    await expect(rows.getByRole('button', { name: 'Mute bass', exact: true })).toHaveAttribute('aria-pressed', 'false')
    // A pattern that is switched off in the code shows so in its row as well.
    await expect(rows.getByRole('button', { name: 'Mute lead', exact: true })).toHaveAttribute('aria-pressed', 'true')

    await rows.getByRole('button', { name: 'Solo bass', exact: true }).click()
    await expect(strip.getByRole('button', { name: 'Solo bass', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await rows.getByRole('button', { name: 'Solo bass', exact: true }).click()
    await expect(strip.getByRole('button', { name: 'Solo bass', exact: true })).toHaveAttribute('aria-pressed', 'false')

    const volume = rows.getByRole('slider', { name: 'Volume of bass', exact: true })
    await expect(volume).toHaveAttribute('aria-valuenow', '1')
    await volume.focus()
    await page.keyboard.press('End')
    await expect.poll(() => code(page)).toContain('.mul(postgain(slider(1.5, 0, 1.5)))')
    await expect(strip.getByRole('slider', { name: 'Volume of bass', exact: true })).toHaveAttribute('aria-valuenow', '1.5')

    const pan = rows.getByRole('slider', { name: 'Pan of bass', exact: true })
    await pan.focus()
    await page.keyboard.press('Home')
    await expect.poll(() => code(page)).toContain('.pan(slider(0, 0, 1))')
    await expect(pan).toHaveAttribute('aria-valuenow', '0')
})

test('bars are named as sections by dragging over them, a section starts the song from it, and is renamed or taken off', async ({ page }) => {
    await open(page)
    await song(page).getByRole('button', { name: 'Name bars', exact: true }).click()
    const sections = page.getByTestId('sections-lane')
    await expect(sections).toContainText('Drag over bars to name them')
    const across = async (from: number, to: number) => {
        const lane = (await sections.boundingBox())!
        const a = (await bar(page, 'drums', from).boundingBox())!
        const b = (await bar(page, 'drums', to).boundingBox())!
        await page.mouse.move(a.x + a.width / 2, lane.y + lane.height / 2)
        await page.mouse.down()
        await page.mouse.move(b.x + b.width / 2, lane.y + lane.height / 2, { steps: 6 })
        await page.mouse.up()
    }

    await across(1, 4)
    await page.getByRole('textbox', { name: 'Name of these bars' }).fill('Intro')
    await page.keyboard.press('Enter')
    await expect.poll(() => code(page)).toContain('// section Intro: 1-4\n')
    // A press on a bar with no name names that bar.
    const fifth = (await bar(page, 'drums', 5).boundingBox())!
    const lane = (await sections.boundingBox())!
    await page.mouse.click(fifth.x + fifth.width / 2, lane.y + lane.height / 2)
    await page.getByRole('textbox', { name: 'Name of these bars' }).fill('Verse')
    await page.keyboard.press('Enter')
    await expect.poll(() => code(page)).toContain('// section Intro: 1-4\n// section Verse: 5\n')

    await sections.getByRole('button', { name: 'Verse, bar 5' }).click()
    await expect(page.getByRole('button', { name: 'Start from bar 5', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await sections.getByRole('button', { name: 'Intro, bars 1 to 4' }).dblclick()
    await page.getByRole('textbox', { name: 'New name of the section' }).fill('Start')
    await page.keyboard.press('Enter')
    await expect.poll(() => code(page)).toContain('// section Start: 1-4\n')
    // A section is taken off by clearing its name, or by its cross where there is room for one.
    await sections.getByRole('button', { name: 'Verse, bar 5' }).dblclick()
    await page.getByRole('textbox', { name: 'New name of the section' }).fill('')
    await page.keyboard.press('Enter')
    await expect.poll(() => code(page)).not.toContain('Verse')
    await sections.getByRole('button', { name: 'Take the name Start off these bars' }).click()
    await expect.poll(() => code(page)).not.toContain('// section')
    await expect(page.getByTestId('sections-name')).toBeVisible()
})
