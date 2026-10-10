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
}

const scrollTo = (page: Page, left: number) => page.getByTestId('song-scroll').evaluate((el, x) => (el.scrollLeft = x === Infinity ? el.scrollWidth : x), left)
const scrollToBar = (page: Page, at: number) =>
    page.getByTestId('song-scroll').evaluate((el, bar) => {
        const width = parseFloat(getComputedStyle(el.firstElementChild as Element).getPropertyValue('--bar'))
        el.scrollLeft = Math.max(0, (bar - 1) * width - 120)
    }, at)

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

test('dragging across bars changes them together', async ({ page }) => {
    await open(page)
    await drag(page, 'drums', 1, 4)
    await expect.poll(() => code(page)).toContain('  .bank("RolandTR909")\n  .mask("<0!4 1!12>")\n')
    await drag(page, 'drums', 3, 2)
    await expect.poll(() => code(page)).toContain('.mask("<0 1!2 0 1!12>")')
    await drag(page, 'drums', 16, 13)
    await expect.poll(() => code(page)).toContain('.mask("<0 1!2 0 1!8 0!4>")')
    await expect(lane(page, 'drums').locator('.sg-c')).toHaveCount(2)
})

test('a bar can be switched from the keyboard', async ({ page }) => {
    await open(page)
    await bar(page, 'bass', 2).focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => code(page)).toContain('.mask("<1 0 1!14>")')
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

test('there are always empty bars after the end of the song to fill', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('song-end')).toBeVisible()
    await expect(bar(page, 'bass', 17)).toHaveAttribute('aria-pressed', 'false')
    expect(await lane(page, 'bass').getByRole('button').count()).toBeGreaterThan(20)
    await expect(page.getByRole('button', { name: 'Start from bar 16', exact: true })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Start from bar 17', exact: true })).toBeDisabled()
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

test('emptying the last bars makes the song shorter again', async ({ page }) => {
    await open(page)
    await drag(page, 'bass', 17, 22)
    await expect(page.getByTestId('song-length')).toHaveText('22 bars, 44 seconds')
    await expect.poll(() => code(page)).toContain('.mask("<1!16 0!6>")')
    await drag(page, 'bass', 22, 21)
    await expect(page.getByTestId('song-length')).toHaveText('20 bars, 40 seconds')
    await expect.poll(() => code(page)).toContain('.mask("<1!16 0!4>")')
    await drag(page, 'bass', 20, 17)
    await expect.poll(() => code(page)).toBe(SONG)
    await expect(page.getByTestId('song-length')).toHaveText('16 bars, 32 seconds')
})

test('reads bars written by hand, one by one or as runs', async ({ page }) => {
    await open(page, 'drums: s("bd*4").mask("<1 1 1 1  0 0 0 0>")\n\nbass: note("c2")\n')
    await expect(page.getByTestId('song-length')).toContainText('8 bars')
    await expect(pressed(lane(page, 'drums'))).toHaveCount(4)
    await expect(pressed(lane(page, 'bass'))).toHaveCount(8)
    await expect(lane(page, 'bass')).toHaveAttribute('data-bars', '8')
    await bar(page, 'drums', 5).click()
    await expect.poll(() => code(page)).toBe('drums: s("bd*4").mask("<1!5 0!3>")\n\nbass: note("c2")\n')
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
    await expect.poll(() => code(page)).toContain('  .s("sawtooth")\n  .room(slider(0.3, 0, 1))\n  .mask("<1!2 0 1!13>")\n')
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
})

const long = (bars: number) => `setcpm(120/4)\n\ndrums: s("bd*4")\n\nbass: note("c2 e2")\n  .mask("<1!${bars}>")\n`

test('a song can be as long as you like', async ({ page }) => {
    await open(page, long(620))
    await expect(page.getByTestId('song-length')).toHaveText('620 bars, 20 min 40 s')
    await expect(lane(page, 'bass')).toHaveAttribute('data-bars', '620')
    expect(await lane(page, 'bass').getByRole('button').count()).toBeLessThan(80)

    await bar(page, 'bass', 3).click()
    await expect.poll(() => code(page)).toContain('.mask("<1!2 0 1!617>")')

    await scrollTo(page, Infinity)
    await expect(bar(page, 'bass', 630)).toBeVisible()
    await bar(page, 'bass', 620).click()
    await expect.poll(() => code(page)).toContain('.mask("<1!2 0 1!616 0>")')
    await expect.poll(() => events(page, 'bass', 619)).toBe(0)
    await expect.poll(() => events(page, 'bass', 618)).toBe(2)

    await bar(page, 'bass', 630).click()
    await expect.poll(() => code(page)).toContain('bass: note("c2 e2")\n  .mask("<1!2 0 1!616 0!10 1>")')
    await expect.poll(() => code(page)).toContain('drums: s("bd*4")\n  .mask("<1!620 0!10>")')
    await expect(page.getByTestId('song-length')).toContainText('630 bars')
    expect(await lane(page, 'bass').getByRole('button').count()).toBeLessThan(80)
})

test('zooming out shows more of a long song and zooming in shows less', async ({ page }) => {
    await open(page, long(200))
    const count = () => lane(page, 'bass').getByRole('button').count()
    const before = await count()
    await page.getByRole('button', { name: 'Show more bars' }).click()
    await expect.poll(count).toBeGreaterThan(before)
    await page.getByRole('button', { name: 'Show fewer bars' }).click()
    await page.getByRole('button', { name: 'Show fewer bars' }).click()
    await expect.poll(count).toBeLessThan(before)
    await page.getByRole('button', { name: 'Show fewer bars' }).click()
    await expect(page.getByRole('button', { name: 'Show fewer bars' })).toBeDisabled()
    await bar(page, 'bass', 2).click()
    await expect.poll(() => code(page)).toContain('.mask("<1 0 1!198>")')
})

test('the playlist follows a long song as it plays', async ({ page }) => {
    await open(page, long(400))
    await scrollToBar(page, 380)
    await page.getByRole('button', { name: 'Start from bar 380', exact: true }).click()
    await scrollTo(page, 0)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(() => now(page)).toBeGreaterThan(379)
    await expect(song(page).locator('.sg-ph')).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Start from bar 380', exact: true })).toBeVisible()
})

test('a run can be dragged past the edge of what is in sight', async ({ page }) => {
    await open(page, long(200))
    const scroll = page.getByTestId('song-scroll')
    const box = (await scroll.boundingBox())!
    const from = (await bar(page, 'bass', 3).boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 6, from.y + from.height / 2, { steps: 5 })
    await expect.poll(() => scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(400)
    await page.mouse.up()
    const text = await code(page)
    const run = Number(/\.mask\("<1!2 0!(\d+) 1!\d+>"\)/.exec(text)?.[1] ?? 0)
    expect(run).toBeGreaterThan(30)
})

test('the playlist stays where it was scrolled to while the song plays elsewhere', async ({ page }) => {
    await open(page, long(400))
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(() => now(page)).toBeGreaterThan(0.2)
    await scrollToBar(page, 300)
    const scroll = page.getByTestId('song-scroll')
    const where = await scroll.evaluate((el) => el.scrollLeft)
    expect(where).toBeGreaterThan(1000)
    await page.waitForTimeout(700)
    expect(await scroll.evaluate((el) => el.scrollLeft)).toBe(where)
    await bar(page, 'bass', 300).click()
    await expect.poll(() => code(page)).toContain('.mask("<1!299 0 1!100>")')
    expect(await scroll.evaluate((el) => el.scrollLeft)).toBe(where)
})

test('a change while the song plays is not heard as a gap', async ({ page }) => {
    const parts = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']
    const kit = (name: string) =>
        `${name}: stack(\n  s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~"),\n  s("hh").struct("x ~ x ~   x ~ x ~   x ~ x ~   x ~ x ~").gain(slider(0.6, 0, 1.5)),\n)\n  .bank("RolandTR909")\n  .mask("<0!4 1!28>")\n`
    await open(page, `setcpm(120/4)\n\n${parts.map(kit).join('\n')}`)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(() => now(page)).toBeGreaterThan(0.5)
    await page.evaluate(() => {
        const w = window as any
        w.__longest = 0
        let last = performance.now()
        setInterval(() => {
            const at = performance.now()
            w.__longest = Math.max(w.__longest, at - last - 5)
            last = at
        }, 5)
    })
    await bar(page, 'three', 2).click()
    await expect.poll(() => code(page)).toContain('three: stack')
    await bar(page, 'five', 6).click()
    await page.getByTestId('strip-one').getByRole('button', { name: 'bd step 2', exact: true }).click()
    await page.waitForTimeout(600)
    // Strudel looks a tenth of a second ahead. A stretch of work longer than that drops sound.
    expect(await page.evaluate(() => (window as any).__longest)).toBeLessThan(100)
})

test('a song whose first bars are silent still starts', async ({ page }) => {
    await open(page, 'setcpm(240/4)\n\ndrums: s("bd*4")\n  .mask("<0!4 1!4>")\n')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(() => now(page)).toBeGreaterThan(0.5)
    await expect(page.getByTestId('cycle')).not.toHaveText('1', { timeout: 15_000 })
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

test('a song with nothing arranged goes round until it is stopped', async ({ page }) => {
    await open(page, 'setcpm(1920/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n')
    await expect(page.getByTestId('song-length')).toContainText('16 bars')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(() => now(page), { timeout: 10000 }).toBeGreaterThan(17)
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    expect(await sounding(page, 18)).toBeGreaterThan(0)
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

test('a click on a bar number still starts from there, and with Shift it makes the bars up to it go round', async ({ page }) => {
    await open(page, 'setcpm(120/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n  .mask("<1!8>")\n')
    await number(page, 3).click()
    await expect(page.getByTestId('cycle')).toHaveText('3')
    await expect(page.getByTestId('loop')).toHaveCount(0)
    await number(page, 6).click({ modifiers: ['Shift'] })
    await expect(page.getByTestId('loop')).toContainText('Bars 3 to 6 go round')
    await number(page, 2).click()
    await expect(page.getByTestId('loop')).toHaveCount(0)
    await expect(page.getByTestId('cycle')).toHaveText('2')
})

test('the bars that go round can be put in once more, in every pattern', async ({ page }) => {
    await open(page, 'setcpm(120/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n  .mask("<1!2 0!2 1!4>")\n\nbass: note("c2 e2")\n  .s("sawtooth")\n  .mask("<0!3 1!5>")\n\nlead: note("c4")\n')
    await dragNumbers(page, 3, 4)
    await page.getByTestId('loop').getByRole('button', { name: 'Repeat them', exact: true }).click()
    await expect.poll(() => code(page)).toContain('.mask("<1!2 0!4 1!4>")')
    expect(await code(page)).toContain('.mask("<0!3 1 0 1!5>")')
    expect(await code(page)).toContain('lead: note("c4")\n')
    await expect(page.getByTestId('song-length')).toContainText('10 bars')
    await expect(page.getByTestId('loop')).toContainText('Bars 5 to 6 go round')
})
