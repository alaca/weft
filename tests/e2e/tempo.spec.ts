import { expect, test, type Page } from '@playwright/test'

const SONG = `setcpm(240/4)

drums: stack(
  s("bd").struct("x ~ ~ ~   ~ ~ ~ ~   x ~ ~ ~   ~ ~ ~ ~"),
)
  .bank("RolandTR909")
  .mask("<1!4>")
`

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
// Where the kicks fall in the song made into a file, in seconds, and how long its bars last.
const made = (page: Page) =>
    page.evaluate(async () => {
        const out = await (window as any).__weft.engine.render({ bars: 4, ringSeconds: 0.5, sampleRate: 22050 })
        const data: Float32Array = out.channels[0]
        const hits: number[] = []
        let quietFor = 9999
        for (let at = 0; at < data.length; at++) {
            const loud = Math.abs(data[at]) > 0.08
            if (loud && quietFor > 2000) hits.push(Math.round((at / out.sampleRate) * 10) / 10)
            quietFor = loud ? 0 : quietFor + 1
        }
        return { seconds: out.seconds as number, hits }
    })

test('the tempo is drawn over the song bar by bar, and the song is played and made into a file that way', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready')
    await page.getByRole('button', { name: 'Song', exact: true }).click()
    await expect(page.getByTestId('song-length')).toHaveText('4 bars, 4 seconds')

    // It starts as the tempo of the song in every bar.
    await page.getByRole('button', { name: 'Draw the tempo', exact: true }).click()
    expect(await code(page)).toContain('setcpm(240/4)\n// tempo <240!4>\n')
    // The second bar is put at the slowest there is and brought up to half the tempo.
    const second = page.getByRole('slider', { name: 'Tempo in bar 2', exact: true })
    await second.focus()
    await page.keyboard.press('Home')
    expect(await code(page)).toContain('// tempo <240 40 240!2>')
    for (let turn = 0; turn < 4; turn++) await page.keyboard.press('PageUp')
    expect(await code(page)).toContain('// tempo <240 120 240!2>')
    await expect(page.getByTestId('song-length')).toHaveText('4 bars, 5 seconds')
    // The tempo in the top bar is that of the bar the song is at, and is changed in the lane.
    await expect(page.getByTestId('tempo')).toBeDisabled()
    await expect(page.getByTestId('tempo')).toHaveValue('240')
    await page.getByRole('button', { name: 'Start from bar 2', exact: true }).click()
    await expect(page.getByTestId('tempo')).toHaveValue('120')
    await page.getByRole('button', { name: 'Start from bar 1', exact: true }).click()

    // A file of the song has each bar at its tempo: the second lasts two seconds, the others one.
    const file = await made(page)
    expect(file.seconds).toBeCloseTo(5, 3)
    expect(file.hits).toEqual([0, 0.5, 1, 2, 3, 3.5, 4, 4.5])

    // Played, the song goes at the tempo of the bar it is in.
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    const bpmIn = async (bar: number) => {
        await expect.poll(() => page.evaluate(() => Math.floor((window as any).__weft.engine.now() + 0.2)), { timeout: 15_000, intervals: [50] }).toBe(bar)
        await page.waitForTimeout(350)
        return page.evaluate(() => Math.round((window as any).__weft.engine.bpm()))
    }
    expect(await bpmIn(1)).toBe(120)
    expect(await bpmIn(2)).toBe(240)
    await page.getByRole('button', { name: 'Stop', exact: true }).click()

    // One tempo for the whole song again.
    await page.getByRole('button', { name: 'One tempo for the whole song again', exact: true }).click()
    expect(await code(page)).not.toContain('// tempo')
    await expect(page.getByTestId('tempo')).toBeEnabled()
    expect(errors).toEqual([])
})
