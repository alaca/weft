import { expect, test, type Page } from '@playwright/test'

const ready = (page: Page) => page.waitForFunction(() => Boolean((window as any).__weft))
const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)

test('plays, counts cycles and stops', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.goto('/')
    await ready(page)

    await expect(page.getByTestId('tempo')).toHaveValue('124')
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')

    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect.poll(async () => Number(await page.getByTestId('cycle').textContent()), { timeout: 20_000 }).toBeGreaterThanOrEqual(2)

    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
    await expect(page.getByTestId('cycle')).toHaveText('1')
    expect(errors).toEqual([])
})

test('shows an evaluation error with its line', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await page.evaluate(() => (window as any).__weft.engine.applyEdit({ from: 0, to: 0, insert: 'broken: s("bd"\n' }))
    await page.getByRole('button', { name: /^Update/ }).click()
    await expect(page.getByTestId('code-status')).toHaveText(/^Line \d+: Unexpected/)
})

const now = (page: import('@playwright/test').Page) => page.evaluate(() => (window as any).__weft.engine.now() as number)

test('the play button pauses, and the song goes on from where it was', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    const pause = page.getByRole('button', { name: 'Pause', exact: true })
    await expect(pause).toBeVisible()
    await expect.poll(() => now(page)).toBeGreaterThan(1.2)
    await pause.click()
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    await expect(page.getByTestId('code-status')).toHaveText('Paused')
    const at = await now(page)
    expect(at).toBeGreaterThan(1.2)
    await page.waitForTimeout(500)
    expect(await now(page)).toBe(at)
    await expect(page.getByTestId('cycle')).toHaveText(String(Math.floor(at) + 1))

    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect.poll(() => now(page)).toBeGreaterThan(at + 0.2)
    expect(await now(page)).toBeLessThan(at + 2)

    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await expect(page.getByTestId('cycle')).toHaveText('1')
    expect(await now(page)).toBe(0)
})

test('the keys that update and silence the song work from anywhere in the window, also when the code has an error', async ({ page }) => {
    await page.goto('/')
    await ready(page)
    const status = page.getByTestId('code-status')
    const before = await code(page)
    await page.evaluate(() => {
        const { engine } = (window as any).__weft
        engine.applyEdit({ from: engine.getCode().length, to: engine.getCode().length, insert: '\nbroken: note("c3"' })
    })
    await page.getByTestId('code').locator('h2').click()
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.cm-editor')))).toBe(false)
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(status).toContainText(/^Line \d+: /)

    await page.evaluate((length) => {
        const { engine } = (window as any).__weft
        engine.applyEdit({ from: length, to: engine.getCode().length, insert: '' })
    }, before.length)
    await expect(status).toContainText(/^Line \d+: /)
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(status).toHaveText('Playing this code')
    await page.keyboard.press('ControlOrMeta+.')
    await expect(status).toHaveText('Stopped')
})

// WebKit gives back what a worklet node took only when its audio clock is closed, so a song
// that has made very many gets a new clock a few seconds after it is stopped by a press. The
// nodes are made here the way hours of a song with crush or distortion leave them.
test('a song that was stopped after very many effects plays on a new audio clock, with the mixer as it was', async ({ page }) => {
    await page.addInitScript(() => {
        const Clock = window.AudioContext
        const made: AudioContext[] = []
        ;(window as any).__clocks = made
        window.AudioContext = class extends Clock {
            constructor(options?: AudioContextOptions) {
                super(options)
                made.push(this)
            }
        }
    })
    await page.goto('/')
    await ready(page)
    const clocks = () => page.evaluate(() => ((window as any).__clocks as AudioContext[]).map((clock) => clock.state))
    const loudest = () => page.evaluate(() => Math.max(...(((window as any).__weft.engine.levels() ?? [0, 0]) as number[])))
    await page.evaluate(() => {
        const engine = (window as any).__weft.engine
        engine.setMix({ ...engine.mix(), volume: 0.4, pan: -0.5 })
    })
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(loudest, { timeout: 20_000 }).toBeGreaterThan(0.01)

    await page.evaluate(async () => {
        const clock = ((window as any).__clocks as AudioContext[])[0]
        for (let at = 0; at < 20500; at++) {
            const node = new AudioWorkletNode(clock, 'crush-processor')
            node.connect(clock.createGain())
            node.disconnect()
            if (at % 500 === 499) await new Promise((done) => setTimeout(done, 20))
        }
    })
    await page.waitForTimeout(1000)
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await expect.poll(clocks, { timeout: 20_000 }).toEqual(['closed', 'running'])

    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await expect.poll(loudest, { timeout: 20_000 }).toBeGreaterThan(0.01)
    expect(await page.evaluate(() => (window as any).__weft.engine.mix())).toMatchObject({ volume: 0.4, pan: -0.5 })
})

// A chord on a ZZFX synth in the first half of each of two bars.
const CHORD = 'setcpm(120/4)\n\npad: note("[c3,e3,g3] ~")\n  .s("z_sawtooth")\n'

test('a chord on a ZZFX synth is worked out once, and sounds the same when it comes round again', async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), CHORD)
    await page.goto('/')
    await ready(page)
    const heard = await page.evaluate(async () => {
        // A note that is worked out is handed to the audio clock as a buffer of its own.
        let workedOut = 0
        const make = BaseAudioContext.prototype.createBuffer
        BaseAudioContext.prototype.createBuffer = function (this: BaseAudioContext, ...given: [number, number, number]) {
            workedOut++
            return make.apply(this, given)
        }
        const made = await (window as any).__weft.engine.render({ bars: 2, ringSeconds: 0, sampleRate: 44100 })
        BaseAudioContext.prototype.createBuffer = make
        const left: Float32Array = made.channels[0]
        const bar = left.length / 2
        let loudest = 0
        let apart = 0
        for (let at = 0; at < bar; at++) {
            loudest = Math.max(loudest, Math.abs(left[at]))
            apart = Math.max(apart, Math.abs(left[at] - left[at + bar]))
        }
        return { workedOut, loudest, apart }
    })
    expect(heard.loudest).toBeGreaterThan(0.1)
    expect(heard.apart).toBeLessThan(0.0001)
    expect(heard.workedOut).toBe(3)
})

// Two drums of one kit in every bar.
const DRUMS = 'setcpm(240/4)\n\ndrums: s("bd ~ sd ~")\n  .bank("RolandTR909")\n'

test('the drums of the song that is open are fetched before it is played, and not again at their first hit', async ({ page }) => {
    const asked: string[] = []
    const arrived: string[] = []
    const drum = (url: string) => /\.wav$/i.test(new URL(url).pathname)
    page.on('request', (request) => void (drum(request.url()) && asked.push(request.url())))
    page.on('requestfinished', (request) => void (drum(request.url()) && arrived.push(request.url())))
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), DRUMS)
    await page.goto('/')
    await ready(page)
    await expect.poll(() => arrived.length, { timeout: 30_000 }).toBe(2)
    expect(asked.map((url) => /rolandtr909-(\w+)\//.exec(url)?.[1]).sort()).toEqual(['bd', 'sd'])

    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(async () => Number(await page.getByTestId('cycle').textContent()), { timeout: 20_000 }).toBeGreaterThanOrEqual(3)
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    expect(asked.length).toBe(2)
})
