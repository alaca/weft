import { expect, test, type Locator, type Page } from '@playwright/test'

const BASS = 'bass: note(`\n  d2 _  ~  ~    f2 ~  ~  ~    ~  ~  ~  ~    a1 _  _  _\n`)\n  .s("sawtooth")\n'
const SONG = `setcpm(120/4)\n\n${BASS}\nlead: note("c4 e4 g4 e4").s("triangle")\n\nkeys: n("0 2 4 2").scale("C:major")\n`

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)

async function open(page: Page, song = SONG) {
    await page.addInitScript((text) => localStorage.setItem('weft.song', text), song)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

async function point(strip: Locator, time: number, midi: number) {
    const grid = strip.locator('.nr-g')
    await grid.scrollIntoViewIfNeeded()
    const box = (await grid.boundingBox())!
    const high = Number(await grid.getAttribute('data-high'))
    const low = Number(await grid.getAttribute('data-low'))
    if (midi > high || midi < low) throw new Error(`${midi} is outside the rows on screen, ${low} to ${high}`)
    return { x: box.x + time * box.width, y: box.y + (high - midi + 0.5) * 10 }
}

const stepTime = (step: number, steps = 16) => (step - 0.5) / steps
const note = (strip: Locator, name: string) => strip.getByRole('button', { name, exact: true })

test('clicking an empty cell adds a note', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    const at = await point(bass, stepTime(9), 40)
    await page.mouse.click(at.x, at.y)
    await expect.poll(() => code(page)).toContain('  d2 _  ~  ~    f2 ~  ~  ~    e2 ~  ~  ~    a1 _  _  _\n')
    await expect(note(bass, 'e2, step 9, 1 step')).toBeVisible()
})

test('a note can be moved, lengthened and removed from the keyboard', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    await note(bass, 'f2, step 5, 1 step').focus()
    await page.keyboard.press('ArrowRight')
    await expect(note(bass, 'f2, step 6, 1 step')).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(note(bass, 'f#2, step 6, 1 step')).toBeFocused()
    await page.keyboard.press('Shift+ArrowRight')
    await expect(note(bass, 'f#2, step 6, 2 steps')).toBeFocused()
    await expect.poll(() => code(page)).toContain('f#2 _')
    await page.keyboard.press('Delete')
    await expect(bass.locator('.nt')).toHaveCount(2)
    await expect.poll(() => code(page)).not.toContain('f#2')
})

test('a note can be dragged to another step and pitch', async ({ page }) => {
    await open(page)
    const bass = page.getByTestId('strip-bass')
    const from = await point(bass, stepTime(13), 33)
    const to = await point(bass, stepTime(9), 35)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 })
    await page.mouse.move(to.x, to.y, { steps: 4 })
    await page.mouse.up()
    await expect(note(bass, 'b1, step 9, 4 steps')).toBeVisible()
    await expect.poll(() => code(page)).toContain('b1 _  _  _')
})

// Drawn while the pointer is down and written once, when it is let go: also the first note of
// a roll that is still empty, and never over a note of the same pitch.
test('a press on an empty place and a drag to the right draws a note as long as the drag', async ({ page }) => {
    await open(page, 'setcpm(120/4)\n\nbass: note("~")\n  .s("sawtooth")\n')
    const bass = page.getByTestId('strip-bass')
    const draw = async (first: number, last: number, midi: number) => {
        const from = await point(bass, stepTime(first), midi)
        const to = await point(bass, stepTime(last), midi + 3)
        await page.mouse.move(from.x, from.y)
        await page.mouse.down()
        await page.mouse.move(to.x, to.y, { steps: 4 })
    }
    await draw(5, 8, 50)
    await expect(bass.locator('.nd')).toHaveCount(1)
    expect(await code(page)).toContain('note("~")')
    await page.mouse.up()
    await expect.poll(() => code(page)).toContain('  ~  ~  ~  ~    d3 _  _  _    ~  ~  ~  ~    ~  ~  ~  ~\n')
    await expect(note(bass, 'd3, step 5, 4 steps')).toBeFocused()
    await expect(bass.locator('.nd')).toHaveCount(0)

    await draw(2, 9, 50)
    await page.mouse.up()
    await expect.poll(() => code(page)).toContain('  ~  d3 _  _    d3 _  _  _    ~  ~  ~  ~    ~  ~  ~  ~\n')
})

test('every pattern of the starter song can be edited by clicking', async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    const chords = page.getByTestId('strip-chords')
    await expect(chords.locator('.nr-g')).toHaveCount(1)
    const at = await point(chords, 0.1, 62)
    await page.mouse.click(at.x, at.y)
    await expect.poll(() => code(page)).toContain('`).slow(4)\n  .s("gm_epiano1")')
    await expect(chords.getByRole('button', { name: 'Cycle 4', exact: true })).toBeVisible()
    await expect(note(chords, 'd4, step 1, 1 step')).toBeVisible()
})

test('a pattern is played on the computer keyboard, and what is played while the song plays is written into its roll', async ({ page }) => {
    await open(page, 'setcpm(60/4)\n\nbass: note(`\n  ~  ~  ~  ~    ~  ~  ~  ~    ~  ~  ~  ~    ~  ~  ~  ~\n`)\n  .s("sawtooth")\n')
    const strip = page.getByTestId('strip-bass')
    const notes = async () => /note\(`([^`]*)`\)/.exec(await code(page))![1].trim().split(/\s+/)
    await strip.getByRole('button', { name: 'Play bass on the keyboard', exact: true }).click()
    await expect(page.getByTestId('piano-note')).toContainText('from c3 to c4')

    // Stopped, a key is only heard: nothing is written.
    await page.locator('body').click({ position: { x: 700, y: 30 } })
    await page.keyboard.press('KeyA')
    expect((await notes()).every((step) => step === '~')).toBe(true)

    // While the song plays the note goes where it was played, and is as long as the key was held.
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await page.keyboard.down('KeyD')
    await page.waitForTimeout(700)
    await page.keyboard.up('KeyD')
    await expect.poll(notes).toContain('e3')
    const at = (await notes()).indexOf('e3')
    expect((await notes())[at + 1]).toBe('_')

    // An octave up, and the letters in the code are still letters.
    await page.keyboard.press('KeyX')
    await expect(page.getByTestId('piano-note')).toContainText('from c4 to c5')
    await page.keyboard.press('KeyS')
    await expect.poll(notes).toContain('d4')
    const before = await code(page)
    await page.locator('.cm-content').click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type('// asdf')
    await expect.poll(() => code(page)).toBe(`${before}// asdf`)

    // With Write off it is heard and not written.
    await strip.getByRole('button', { name: 'Write what is played', exact: true }).click()
    await page.locator('body').click({ position: { x: 700, y: 30 } })
    await page.keyboard.press('KeyG')
    await page.waitForTimeout(300)
    expect((await notes()).some((step) => step.startsWith('g'))).toBe(false)
})


test('a note glides from the note before when its step is switched on in the Glide lane, and is heard sliding up to its pitch', async ({ page }) => {
    await open(page, 'setcpm(120/4)\n\nlead: note(`\n  c3 ~  g3 ~\n`)\n  .s("sine")\n')
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    const strip = page.getByTestId('strip-lead')
    await strip.locator('.st-n').click()
    await strip.getByRole('button', { name: 'Glide of the notes of lead, step by step', exact: true }).click()
    await expect(strip.getByRole('button', { name: 'Glide into step 2 of lead', exact: true })).toBeDisabled()
    await strip.getByRole('button', { name: 'Glide into step 3 of lead', exact: true }).click()
    await expect.poll(() => code(page)).toContain('note(`\n  c3 ~  g3 ~\n`).penv("0 0 7 0").pattack(0.08).prelease(600)')
    await expect(strip.locator('.nt.gl')).toHaveCount(1)

    // The pitch of g3 as it starts, and once it is there, counted from the song made into sound.
    const pitch = () =>
        page.evaluate(async () => {
            const made = await (window as any).__weft.engine.render({ bars: 1, ringSeconds: 0, sampleRate: 44100 }, () => undefined)
            const wave = made.channels[0] as Float32Array
            const rate = made.sampleRate as number
            const hertz = (from: number, to: number) => {
                let crossings = 0
                for (let at = Math.floor(from * rate) + 1; at < Math.floor(to * rate); at++) if (wave[at - 1] < 0 && wave[at] >= 0) crossings++
                return crossings / (to - from)
            }
            return { starting: hertz(1.0, 1.05), there: hertz(1.2, 1.45) }
        })
    const sliding = await pitch()
    expect(sliding.starting).toBeLessThan(175)
    expect(Math.abs(sliding.there - 196)).toBeLessThan(6)

    await strip.getByRole('button', { name: 'Glide into step 3 of lead', exact: true }).click()
    await expect.poll(() => code(page)).not.toContain('penv')
    const straight = await pitch()
    expect(Math.abs(straight.starting - 196)).toBeLessThan(25)
})
