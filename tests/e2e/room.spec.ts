import { expect, test } from '@playwright/test'

// A bell at the start of the bar that sends all of itself into a room of size 4, and a quiet
// tick an eighth later that sends next to nothing into it but asks for a room of size 1. With
// no lowpass on the room it is made at once, so a file has it from the first note.
const SONG =
    'setcpm(120/4)\n\nbell: note("c4")\n  .s("triangle")\n  .decay(0.1)\n  .sustain(0)\n  .roomlp(0)\n  .room(1)\n  .roomsize(4)\n\ntick: note("~ c6 ~ ~ ~ ~ ~ ~")\n  .s("triangle")\n  .decay(0.02)\n  .sustain(0)\n  .gain(0.05)\n  .roomlp(0)\n  .room(0.01)\n  .roomsize(1)\n'

test('a pattern that asks for another room size does not cut off the reverb of the pattern that was there first', async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    // How loud the second half of the bar is, where only the bell's reverb is left.
    const ringing = (only?: string) =>
        page.evaluate(async (only) => {
            const made = await (window as any).__weft.engine.render({ bars: 1, ringSeconds: 0, sampleRate: 44100, only })
            const left: Float32Array = made.channels[0]
            let sum = 0
            for (let at = 44100; at < 83790; at++) sum += left[at] * left[at]
            return Math.sqrt(sum / 39690)
        }, only)
    const alone = await ringing('bell')
    const together = await ringing()
    expect(alone).toBeGreaterThan(0.0005)
    expect(together).toBeGreaterThan(alone / 2)
})
