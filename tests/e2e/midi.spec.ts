import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { readMidiFile } from '../../src/library/midifile'

const SONG = 'setcpm(120/4)\n\ndrums: stack(\n  s("bd").struct("~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n  s("sd").struct("~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n)\n  .bank("RolandTR909")\n\nlead: note(`\n  ~ ~ ~ ~   ~ ~ ~ ~\n`)\n  .s("triangle")\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const heard = (page: Page) =>
    page.evaluate(() => {
        const wave = (window as any).__weft.engine.waveform() as Float32Array | null
        return wave ? Math.max(...Array.from(wave, Math.abs)) : 0
    })
// What a keyboard sends: a key pressed, and the same key let go.
const press = (page: Page, note: number, force = 100) => page.evaluate(([n, f]) => (window as any).__keys.send([0x90, n, f]), [note, force])
const letGo = (page: Page, note: number) => page.evaluate((n) => (window as any).__keys.send([0x80, n, 0]), note)

test('a MIDI keyboard plays the pattern you are on, and is written into a piano roll whose Keys are on', async ({ page }) => {
    await page.addInitScript((value) => {
        localStorage.setItem('weft.song', value)
        // A keyboard that is plugged in, as the window would be told of one.
        const input: { name: string; state: string; onmidimessage: ((event: { data: Uint8Array }) => void) | null } = { name: 'Test keys 49', state: 'connected', onmidimessage: null }
        ;(window as any).__keys = { send: (bytes: number[]) => input.onmidimessage?.({ data: new Uint8Array(bytes) }) }
        ;(navigator as any).requestMIDIAccess = async () => ({ inputs: new Map([['one', input]]), onstatechange: null })
    }, SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })

    // Keys on at the piano roll: the keyboard is found, and a key is heard.
    await page.getByTestId('strip-lead').locator('.st-n').click()
    await page.getByRole('button', { name: 'Play lead on the keyboard', exact: true }).click()
    await expect(page.getByTestId('piano-note')).toContainText('A MIDI keyboard plays it too')
    const before = await code(page)
    await press(page, 64)
    await expect.poll(() => heard(page)).toBeGreaterThan(0.01)
    await letGo(page, 64)
    // With the song stopped nothing is written.
    expect(await code(page)).toBe(before)

    // While the song plays, what is played is written into the roll.
    await page.getByRole('button', { name: 'Live', exact: true }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await press(page, 67, 64)
    await page.waitForTimeout(150)
    await letGo(page, 67)
    await expect.poll(() => code(page)).toContain('g4')
    await page.getByRole('button', { name: 'Stop', exact: true }).click()

    // How hard the key was pressed is the level of its note: it stands under the roll, where
    // a double click puts it back to the level of a note put in by hand.
    expect(await code(page)).toContain('.postgain("')
    const level = page.locator('.lb.on')
    await expect(level).toHaveAttribute('aria-valuenow', '0.64')
    await level.dblclick()
    await expect.poll(() => code(page)).not.toContain('.postgain("')

    // On a drum grid a key plays the sound its note stands for, and writes nothing.
    await page.getByRole('button', { name: 'Play lead on the keyboard', exact: true }).click()
    await page.getByTestId('strip-drums').locator('.st-n').click()
    const drums = await code(page)
    await page.waitForTimeout(700)
    await press(page, 38)
    await expect.poll(() => heard(page)).toBeGreaterThan(0.01)
    expect(await code(page)).toBe(drums)

    // The sound settings name the keyboard.
    await page.getByRole('button', { name: 'Mixer', exact: true }).click()
    await page.getByTestId('mixer').getByRole('button', { name: 'Devices', exact: true }).click()
    await expect(page.getByTestId('sound-midi')).toHaveText('Test keys 49')
})

test('a pattern is sent out over MIDI in place of being played by the app, on the channel that is chosen', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('weft.song', 'setcpm(120/4)\n\nlead: note("c3 e3 g3 c4").postgain("1 0.5 1 1.27")\n  .s("triangle")\n')
        // A synth that is plugged in, as the window would be told of one, keeping what it is sent.
        const sent: number[][] = []
        ;(window as any).__sent = sent
        const synth = { name: 'Test synth', state: 'connected', send: (bytes: number[]) => void sent.push(Array.from(bytes)), clear() {} }
        ;(navigator as any).requestMIDIAccess = async () => ({ inputs: new Map(), outputs: new Map([['one', synth]]), onstatechange: null })
    })
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    const sent = () => page.evaluate(() => (window as any).__sent as number[][])

    await page.getByRole('button', { name: 'Sound controls for lead', exact: true }).click()
    const played = page.getByLabel('What plays lead')
    await expect(played).toHaveValue('here')
    // A browser is only asked for its MIDI outputs once the list is gone to.
    await played.focus()
    await played.selectOption({ label: 'MIDI, Test synth' })
    await expect.poll(() => code(page)).toContain('.midi("Test synth")')

    // Its notes go to the synth, each pressed and let go, and the app itself plays none of them.
    await page.getByRole('button', { name: 'Live', exact: true }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(async () => (await sent()).filter((bytes) => bytes[0] === 0x90).map((bytes) => bytes[1])).toEqual(expect.arrayContaining([48, 52, 55, 60]))
    expect((await sent()).some((bytes) => bytes[0] === 0x80)).toBe(true)
    expect(await heard(page)).toBeLessThan(0.001)
    // Each key is pressed as hard as the level of its note says, 100 of 127 where it says 1.
    const forces = Object.fromEntries((await sent()).filter((bytes) => bytes[0] === 0x90).map((bytes) => [bytes[1], bytes[2]]))
    expect([forces[48], forces[52], forces[60]]).toEqual([100, 50, 127])

    // Another channel, and the notes are sent on it.
    await page.getByLabel('MIDI channel of lead').selectOption('3')
    await expect.poll(() => code(page)).toContain('.midichan(3)')
    await expect.poll(async () => (await sent()).some((bytes) => bytes[0] === 0x92)).toBe(true)

    // Stopping the song ends every note that sounds.
    await page.getByRole('button', { name: 'Stop', exact: true }).click()
    await expect.poll(async () => (await sent()).some((bytes) => bytes[0] === 0xb2 && bytes[1] === 123)).toBe(true)

    // Played by the app again, the line is gone from the code.
    await played.selectOption({ label: 'Weft Loom' })
    await expect.poll(() => code(page)).not.toContain('midi')
})

test('a pad writes hits into a drum grid, a note sounds for as long as its key is held, and a controller knob turns a knob of the app', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('weft.song', 'setcpm(120/4)\n\ndrums: stack(\n  s("bd").struct("~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n  s("sd").struct("~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n)\n  .bank("RolandTR909")\n\nlead: note(`\n  ~ ~ ~ ~   ~ ~ ~ ~\n`)\n  .s("triangle")\n  .lpf(slider(700, 100, 8000))\n')
        const input: { name: string; state: string; onmidimessage: ((event: { data: Uint8Array }) => void) | null } = { name: 'Test pads', state: 'connected', onmidimessage: null }
        ;(window as any).__keys = { send: (bytes: number[]) => input.onmidimessage?.({ data: new Uint8Array(bytes) }) }
        ;(navigator as any).requestMIDIAccess = async () => ({ inputs: new Map([['one', input]]), onstatechange: null })
    })
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    const turn = (value: number) => page.evaluate((v) => (window as any).__keys.send([0xb0, 74, v]), value)

    // Keys on at the drum grid: while the song plays, the pad for the kick puts a hit in its row.
    await page.getByRole('button', { name: 'Play drums on the keyboard', exact: true }).click()
    await expect(page.getByTestId('pad-note')).toContainText('A MIDI pad or keyboard plays them too')
    await page.getByRole('button', { name: 'Live', exact: true }).click()
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.getByTestId('code-status')).toHaveText('Playing this code')
    await press(page, 36)
    await expect.poll(() => code(page)).toMatch(/s\("bd"\)\.struct\("[~ ]*x/)
    expect(await code(page)).toMatch(/s\("sd"\)\.struct\("[~ ]+"\)/)
    await page.getByRole('button', { name: 'Stop', exact: true }).click()

    // A key of the piano roll sounds until it is let go.
    await page.getByRole('button', { name: 'Play lead on the keyboard', exact: true }).click()
    await page.waitForTimeout(600)
    await press(page, 60)
    await page.waitForTimeout(900)
    expect(await heard(page)).toBeGreaterThan(0.01)
    await letGo(page, 60)
    await expect.poll(() => heard(page)).toBeLessThan(0.001)

    // A knob of the controller is taught to turn the cutoff of the lead, and then turns it.
    await page.getByRole('button', { name: 'Mixer', exact: true }).click()
    await page.getByTestId('mixer').getByRole('button', { name: 'Devices', exact: true }).click()
    await page.getByRole('button', { name: 'Learn the knobs of a controller', exact: true }).click()
    await expect(page.getByTestId('knob-learn')).toContainText('Press a knob in the app')
    await page.getByTestId('strip-lead').getByRole('slider', { name: 'Cutoff', exact: true }).click()
    await expect(page.getByTestId('knob-learn')).toContainText('for Cutoff of lead')
    await turn(64)
    await expect(page.getByTestId('knob-learn')).toContainText('Cutoff of lead is turned by knob 74.')
    await page.getByTestId('knob-learn').getByRole('button', { name: 'Done', exact: true }).click()
    await turn(0)
    await expect.poll(() => code(page)).toContain('.lpf(slider(100, 100, 8000))')
    await turn(127)
    await expect.poll(() => code(page)).toContain('.lpf(slider(8000, 100, 8000))')
})

test('the notes of a song are saved as a MIDI file, and a MIDI file is opened as a song', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('weft.song', 'setcpm(120/4)\n\ndrums: stack(\n  s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~"),\n)\n  .bank("RolandTR909")\n  .mask("<1!2>")\n\nlead: note("c3 e3 g3 c4")\n  .s("triangle")\n  .mask("<1 0>")\n')
    })
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })

    // A track for each pattern, in the bars it plays in: the lead rests in the second bar.
    await page.getByTestId('top').getByRole('button', { name: 'Export', exact: true }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').getByRole('button', { name: 'MIDI (.mid)', exact: true }).click()])
    expect(download.suggestedFilename()).toBe('Untitled.mid')
    const bytes = await readFile(await download.path())
    const file = readMidiFile(new Uint8Array(bytes))!
    expect(Math.round(file.tempos[0].bpm)).toBe(120)
    const drums = file.tracks.find((track) => track.channel === 9)!
    const lead = file.tracks.find((track) => track.channel !== 9)!
    expect(drums.notes.map((note) => [note.tick, note.note])).toEqual([0, 480, 960, 1440, 1920, 2400, 2880, 3360].map((tick) => [tick, 36]))
    expect(lead.notes.map((note) => [note.tick, note.note])).toEqual([
        [0, 48],
        [480, 52],
        [960, 55],
        [1440, 60],
    ])
    await page.getByRole('button', { name: 'Close export', exact: true }).click()

    // The same file opened: a new song with a drum grid and a piano roll.
    await page.getByTestId('song-file').setInputFiles({ name: 'From elsewhere.mid', mimeType: 'audio/midi', buffer: bytes })
    await expect(page.getByTestId('song-note')).toHaveText('Opened From elsewhere from a MIDI file: 2 patterns of 2 bars.')
    const opened = await code(page)
    expect(opened).toContain('setcpm(120/4)')
    expect(opened).toMatch(/drums: stack\(\n\s+s\("bd"\)\.struct\("x ~ ~ ~   x ~ ~ ~/)
    expect(opened).toMatch(/lead: note\(`\n\s+c3\s+_\s+_\s+_\s+e3\s+_\s+_\s+_\s+g3\s+_\s+_\s+_\s+c4\s+_\s+_\s+_\s+~/)
    await expect(page.getByTestId('strip-lead')).toBeVisible()
})
