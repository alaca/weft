import { expect, test, type Page } from '@playwright/test'

const SONG = `setcpm(120/4)

drums: stack(
  s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~"),
)
  .bank("RolandTR909")
  .mask("<1!4>")
`

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
// The notes a pattern plays in a bar, lowest first, whatever bars it is in.
const notesOf = (page: Page, id: string, bar: number) =>
    page.evaluate(
        ([name, at]) => {
            const names = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']
            const midis: number[] = (window as any).__weft.engine.events(name, at, true).map((event: { midi: number }) => event.midi)
            return [...new Set(midis)].sort((a, b) => a - b).map((midi) => `${names[midi % 12]}${Math.floor(midi / 12) - 1}`)
        },
        [id, bar] as const,
    )

test('a song gets chords, one for every bar, and the patterns that follow them play the chord of the bar', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready')

    await page.getByRole('button', { name: 'Add chords', exact: true }).click()
    expect(await code(page)).toContain('setcpm(120/4)\n\nconst chords = "<C!4>"\n\ndrums:')

    // A chord is chosen and put on bars: the first two A minor, the last one a G seventh.
    const palette = page.getByTestId('chord-palette')
    await palette.getByRole('radio', { name: 'A', exact: true }).click()
    await palette.getByRole('radio', { name: 'Minor', exact: true }).click()
    await expect(page.getByTestId('chord-brush')).toHaveText('Am')
    for (const bar of [1, 2]) {
        await page.getByRole('button', { name: new RegExp(`^Chord of bar ${bar}:`) }).focus()
        await page.keyboard.press('Enter')
    }
    await palette.getByRole('radio', { name: 'G', exact: true }).click()
    await palette.getByRole('radio', { name: '7', exact: true }).click()
    await page.getByRole('button', { name: /^Chord of bar 4:/ }).focus()
    await page.keyboard.press('Enter')
    expect(await code(page)).toContain('const chords = "<Am!2 C G7>"')
    await expect(page.getByRole('button', { name: 'Chord of bar 2: Am', exact: true })).toBeVisible()

    // A bass and a pad that follow: each plays the chord of the bar it is in.
    await palette.getByRole('button', { name: '+ Bass', exact: true }).click()
    await palette.getByRole('button', { name: '+ Chords', exact: true }).click()
    expect(await code(page)).toContain('bass: n("0 ~ ~ ~   0 ~ ~ ~   0 ~ ~ ~   0 ~ ~ ~").chord(chords).mode("root:c2").voicing()')
    expect(await notesOf(page, 'bass', 0)).toEqual(['a1'])
    expect(await notesOf(page, 'bass', 2)).toEqual(['c2'])
    expect(await notesOf(page, 'bass', 3)).toEqual(['g1'])
    expect(await notesOf(page, 'pad', 0)).toEqual(['a2', 'c3', 'e3', 'a3'])

    // Its grid has a row for each note of the chord: one more note of it on a step, by a click.
    const bass = page.getByTestId('strip-bass')
    await expect(bass.getByTestId('chord-now')).toContainText('The chord of this bar is Am')
    await bass.getByRole('button', { name: '3 step 3', exact: true }).click()
    expect(await code(page)).toContain('bass: n("0 ~ 2 ~   0 ~ ~ ~   0 ~ ~ ~   0 ~ ~ ~")')
    expect(await notesOf(page, 'bass', 0)).toEqual(['a1', 'e2'])
    await bass.getByRole('button', { name: 'Middle', exact: true }).click()
    expect(await code(page)).toContain('.chord(chords).mode("root:c3").voicing()')

    // One chord is changed in the one place, and both patterns play the new one.
    await palette.getByRole('radio', { name: 'F', exact: true }).click()
    await palette.getByRole('radio', { name: 'Major', exact: true }).click()
    await page.getByRole('button', { name: /^Chord of bar 1:/ }).focus()
    await page.keyboard.press('Enter')
    expect(await notesOf(page, 'bass', 0)).toEqual(['f2', 'f3'])
    expect(await notesOf(page, 'pad', 0)).toEqual(['f2', 'c3', 'f3', 'a3'])

    // The chords are taken out of the song: the patterns keep the ones they played, and follow
    // again when the song is given chords again.
    await page.getByRole('button', { name: 'Take the chords out of the song', exact: true }).click()
    expect(await code(page)).not.toContain('const chords')
    expect(await code(page)).toContain('.chord("<F Am C G7>").mode("root:c3").voicing()')
    expect(await notesOf(page, 'bass', 0)).toEqual(['f2', 'f3'])
    await expect(bass.getByTestId('chord-now')).toContainText('Plays chords of its own')
    await page.getByRole('button', { name: 'Add chords', exact: true }).click()
    expect(await code(page)).toContain('const chords = "<F Am C G7>"')
    expect(await code(page)).toContain('.chord(chords).mode("root:c3").voicing()')

    await page.getByRole('button', { name: 'Live', exact: true }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect.poll(async () => Number(await page.getByTestId('cycle').textContent()), { timeout: 20_000 }).toBeGreaterThanOrEqual(2)
    expect(errors).toEqual([])
})
