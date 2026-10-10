import { expect, test, type Page } from '@playwright/test'

const SONG =
    'setcpm(120/4)\n\ndrums: stack(\n  s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~"),\n  s("hh").struct("~ ~ x ~   ~ ~ x ~   ~ ~ x ~   ~ ~ x ~"),\n)\n  .bank("RolandTR909")\n\nbass: note("c2")\n  .s("sawtooth")\n\npad: note("c3")\n  .s("triangle")\n'
const NO_KICK = 'setcpm(120/4)\n\nhats: stack(\n  s("hh").struct("x x x x   x x x x   x x x x   x x x x"),\n)\n  .bank("RolandTR909")\n\nbass: note("c2")\n  .s("sawtooth")\n'
const KICK = '  s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~")'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const panel = (page: Page, id: string) => page.getByTestId(`strip-${id}`).getByRole('button', { name: `Sound controls for ${id}`, exact: true })
const pump = (page: Page, id: string) => page.getByTestId(`strip-${id}`).getByRole('button', { name: 'Pump', exact: true })

async function open(page: Page, song = SONG) {
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), song)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

test('a pattern is switched to pump under the kick, and the kick is told to duck it', async ({ page }) => {
    await open(page)
    await panel(page, 'bass').click()
    await expect(pump(page, 'bass')).toHaveAttribute('aria-pressed', 'false')
    await pump(page, 'bass').click()
    await expect.poll(() => code(page)).toContain('bass: note("c2")\n  .s("sawtooth")\n  .orbit(2)\n')
    expect(await code(page)).toContain(`${KICK}.duckorbit(2).duckattack(0.2).duckdepth(slider(0.8, 0, 1)),\n`)
    await expect(pump(page, 'bass')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')

    const depth = page.getByTestId('strip-bass').getByRole('slider', { name: 'Pump', exact: true })
    await expect(depth).toHaveAttribute('aria-valuenow', '0.8')
    await depth.focus()
    await page.keyboard.press('Home')
    await expect.poll(() => code(page)).toContain('.duckdepth(slider(0, 0, 1))')

    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect.poll(() => page.evaluate(() => (window as any).__weft.engine.now() as number)).toBeGreaterThan(0.6)
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
})

test('the kick ducks once however many patterns pump, and stops when the last one does', async ({ page }) => {
    await open(page)
    await panel(page, 'bass').click()
    await pump(page, 'bass').click()
    await panel(page, 'bass').click()
    await panel(page, 'pad').click()
    await pump(page, 'pad').click()
    await expect.poll(() => code(page)).toContain('pad: note("c3")\n  .s("triangle")\n  .orbit(2)\n')
    expect((await code(page)).match(/duckorbit/g)).toHaveLength(1)

    await pump(page, 'pad').click()
    await expect.poll(() => code(page)).toMatch(/pad: note\("c3"\)\n {2}\.s\("triangle"\)\n$/)
    expect(await code(page)).toContain('.duckorbit(2)')
    await panel(page, 'pad').click()
    await panel(page, 'bass').click()
    await pump(page, 'bass').click()
    await expect.poll(() => code(page)).toBe(SONG)
})

test('there is no pump without a kick, and the kick cannot pump its own pattern', async ({ page }) => {
    await open(page, NO_KICK)
    await panel(page, 'bass').click()
    await expect(pump(page, 'bass')).toBeDisabled()
    await expect(pump(page, 'bass')).toHaveAttribute('title', /needs a kick/)

    await page.evaluate((value) => (window as any).__weft.engine.setCode(value), SONG)
    await expect(pump(page, 'bass')).toBeEnabled()
    await panel(page, 'bass').click()
    await panel(page, 'drums').click()
    await expect(pump(page, 'drums')).toBeDisabled()
})

test('a pumped pattern is quieter straight after the kick than without pump', async ({ page }) => {
    test.setTimeout(90000)
    const quietKick = SONG.replace(`${KICK},`, `${KICK}.gain(0.001),`).replace('bass: note("c2")', 'bass: note("c2").sustain(1)')
    await open(page, quietKick)
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    await page.getByRole('button', { name: 'Mute pad', exact: true }).click()
    const loudness = () =>
        page.evaluate(async () => {
            const made = await (window as any).__weft.engine.render({ bars: 1, ringSeconds: 0, sampleRate: 44100 })
            const left: Float32Array = made.channels[0]
            const rms = (from: number, to: number) => {
                let sum = 0
                for (let at = Math.floor(from * 44100); at < Math.floor(to * 44100); at++) sum += left[at] * left[at]
                return Math.sqrt(sum / Math.floor((to - from) * 44100))
            }
            return { after: rms(0.03, 0.09), later: rms(0.38, 0.48) }
        })
    const plain = await loudness()
    await panel(page, 'bass').click()
    await pump(page, 'bass').click()
    await expect.poll(() => code(page)).toContain('.duckorbit(2)')
    const pumped = await loudness()
    expect(plain.after).toBeGreaterThan(0.01)
    expect(pumped.after).toBeLessThan(plain.after * 0.6)
    expect(pumped.later).toBeGreaterThan(pumped.after * 1.5)
})
