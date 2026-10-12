import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(960/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n  .mask("<0!2 1!2>")\n\nbass: note("c2 e2")\n  .s("sawtooth")\n'

const now = (page: Page) => page.evaluate(() => (window as any).__weft.engine.now() as number)
const sounding = (page: Page, cycle: number) => page.evaluate((at) => (window as any).__weft.engine.audible(at).length as number, cycle)
const mode = (page: Page, name: 'Song' | 'Live') => page.getByRole('group', { name: 'What plays' }).getByRole('button', { name, exact: true })

async function open(page: Page) {
    await page.addInitScript((value) => {
        if (!sessionStorage.getItem('seeded')) {
            localStorage.setItem('weft.song', value)
            sessionStorage.setItem('seeded', '1')
        }
    }, SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

test('song plays the bars as they are filled, live plays every pattern whatever the bars say', async ({ page }) => {
    await open(page)
    await expect(mode(page, 'Song')).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    expect(await sounding(page, 0)).toBe(2)
    expect(await sounding(page, 2)).toBe(6)
    await expect(page.getByTestId('code-status')).toHaveText('Stopped', { timeout: 8000 })

    await mode(page, 'Live').click()
    await expect(mode(page, 'Live')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('live-note')).toContainText('every pattern plays')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect.poll(() => sounding(page, 0)).toBe(6)
    await expect.poll(() => now(page), { timeout: 10000 }).toBeGreaterThan(6)
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect(page.getByTestId('strip-drums')).not.toHaveClass(/rest/)

    await mode(page, 'Song').click()
    await expect(page.getByTestId('live-note')).toHaveCount(0)
    await expect(page.getByTestId('code-status')).toHaveText('Stopped', { timeout: 8000 })
    await expect(page.getByTestId('cycle')).toHaveText('1')
})

test('scenes keep which patterns play, are written into the song, and one that is chosen while it plays comes in with the next bar', async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), 'setcpm(60/4)\n\ndrums: s("bd*4")\n  .bank("RolandTR909")\n\nbass: note("c2 e2")\n  .s("sawtooth")\n')
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    const code = () => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
    await mode(page, 'Live').click()
    const scenes = page.getByTestId('scenes')

    // Everything plays: that is the first scene. Without the bass: the second.
    await scenes.getByRole('button', { name: '+ Keep what plays now', exact: true }).click()
    await expect.poll(code).toContain('// scene Scene 1: drums bass\n')
    await page.getByTestId('song').getByRole('button', { name: 'Mute bass', exact: true }).click()
    await scenes.getByRole('button', { name: '+ Keep what plays now', exact: true }).click()
    await expect.poll(code).toContain('// scene Scene 1: drums bass\n// scene Scene 2: drums\n')
    await expect(scenes.getByRole('button', { name: 'Scene 2', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(scenes.getByRole('button', { name: 'Scene 1', exact: true })).toHaveAttribute('aria-pressed', 'false')

    // Stopped, a scene is there at once.
    await scenes.getByRole('button', { name: 'Scene 1', exact: true }).click()
    await expect.poll(code).toContain('\nbass: note(')
    await expect(scenes.getByRole('button', { name: 'Scene 1', exact: true })).toHaveAttribute('aria-pressed', 'true')

    // Playing, it waits for the bar to end: a bar is four seconds here.
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(async () => (await now(page)) % 1).toBeGreaterThan(0.1)
    await expect.poll(async () => (await now(page)) % 1).toBeLessThan(0.5)
    const bar = Math.floor(await now(page))
    await scenes.getByRole('button', { name: 'Scene 2', exact: true }).click()
    await expect(scenes.getByRole('button', { name: 'Scene 2', exact: true })).toHaveClass(/wait/)
    expect(await code()).toContain('\nbass: note(')
    await expect.poll(code, { timeout: 8000 }).toContain('\n_bass: note(')
    expect(await now(page)).toBeGreaterThan(bar + 0.8)
    await expect(scenes.getByRole('button', { name: 'Scene 2', exact: true })).toHaveAttribute('aria-pressed', 'true')
    // The code changes a moment before the bar, and the bass plays on until the bar itself.
    await expect.poll(() => sounding(page, bar + 1)).toBe(4)
    expect(await sounding(page, bar)).toBe(6)

    // Chosen in the last moment of a bar, a scene waits for the bar after.
    const near = await page.waitForFunction(() => {
        const at = (window as any).__weft.engine.now() as number
        return at % 1 > 0.9 && at % 1 < 0.94 ? { bar: Math.floor(at) } : null
    })
    const late = (await near.jsonValue())!.bar
    await scenes.getByRole('button', { name: 'Scene 1', exact: true }).click()
    await expect.poll(code, { timeout: 12000 }).toContain('\nbass: note(')
    expect(await now(page)).toBeGreaterThan(late + 1.8)
    await expect.poll(() => sounding(page, late + 2)).toBe(6)
    expect(await sounding(page, late + 1)).toBe(4)
    await page.getByRole('button', { name: 'Stop', exact: true }).click()

    // A scene gets a name of its own, and is taken out again.
    await scenes.getByRole('button', { name: 'Scene 2', exact: true }).dblclick()
    await scenes.getByLabel('Name of the scene Scene 2').fill('break')
    await scenes.getByLabel('Name of the scene Scene 2').press('Enter')
    await expect.poll(code).toContain('// scene break: drums\n')
    await scenes.getByRole('button', { name: 'Scene 1', exact: true }).hover()
    await scenes.getByRole('button', { name: 'Remove the scene Scene 1', exact: true }).click()
    await expect.poll(code).not.toContain('Scene 1')
    await expect(scenes.getByRole('button', { name: 'break', exact: true })).toBeVisible()
})

