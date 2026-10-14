import { expect, test, type Locator, type Page } from '@playwright/test'

const SONG =
    'setcpm(120/4)\n\nlead: note(`\n  c4 ~  ~  ~    e4 ~  ~  ~    g4 ~  ~  ~    ~  ~  ~  ~     ~  ~  ~  ~    ~  ~  ~  ~    ~  ~  ~  ~    ~  ~  ~  ~\n`).slow(2)\n  .s("triangle")\n\n' +
    'drums: stack(\n  s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~"),\n  s("sd").struct("~ ~ ~ ~   x ~ ~ ~   ~ ~ ~ ~   x ~ ~ ~"),\n)\n  .bank("RolandTR909")\n\n' +
    'more: stack(\n  s("hh").struct("~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~   ~ ~ ~ ~"),\n)\n  .bank("RolandTR909")\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const middle = async (thing: Locator) => {
    const box = (await thing.boundingBox())!
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
// A box drawn with Shift held, from one point to another.
async function shiftDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
    await page.keyboard.down('Shift')
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 })
    await page.mouse.move(to.x, to.y, { steps: 3 })
    await page.mouse.up()
    await page.keyboard.up('Shift')
}

test('notes and steps are chosen with a box, moved together, copied, pasted and taken out', async ({ page }) => {
    await page.addInitScript((text) => localStorage.setItem('weft.song', text), SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    const roll = page.getByTestId('strip-lead')
    const note = (start: number, midi: number) => roll.locator(`.nt[data-start="${start}"][data-midi="${midi}"]`)

    // Two notes chosen with a box, and moved together by dragging one of them a step on.
    const low = (await note(0, 60).boundingBox())!
    const high = (await note(4, 64).boundingBox())!
    await shiftDrag(page, { x: low.x + 2, y: high.y - 4 }, { x: high.x + high.width + 2, y: low.y + low.height - 1 })
    await expect(roll.locator('.nt.sel')).toHaveCount(2)
    const from = await middle(note(4, 64))
    const step = (await roll.locator('.nr-g').boundingBox())!.width / 16
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + step, from.y, { steps: 4 })
    await page.mouse.up()
    await expect(note(1, 60)).toHaveClass(/sel/)
    await expect(note(5, 64)).toHaveClass(/sel/)
    await expect(note(8, 67)).not.toHaveClass(/sel/)

    // Copied and pasted on the same bar, they go into the next one, and are chosen there.
    await page.keyboard.press('ControlOrMeta+c')
    await page.keyboard.press('ControlOrMeta+v')
    await expect(roll.getByRole('button', { name: 'Cycle 2', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(note(17, 60)).toHaveClass(/sel/)
    await expect(note(21, 64)).toHaveClass(/sel/)
    expect((await code(page)).match(/c4/g)).toHaveLength(2)
    // Delete takes out what is chosen, and nothing else.
    await page.keyboard.press('Delete')
    await expect(note(17, 60)).toHaveCount(0)
    expect((await code(page)).match(/c4/g)).toHaveLength(1)

    // Steps of two sounds chosen with a box, copied, and pasted into another drum grid, where
    // the sound it lacked gets a row.
    const drums = page.getByTestId('strip-drums')
    await shiftDrag(page, await middle(drums.getByRole('button', { name: 'bd step 1', exact: true })), await middle(drums.getByRole('button', { name: 'sd step 8', exact: true })))
    await expect(drums.locator('.pad.sel')).toHaveCount(16)
    await page.keyboard.press('ControlOrMeta+c')
    const more = page.getByTestId('strip-more')
    await more.getByRole('button', { name: 'hh step 16', exact: true }).hover()
    await page.mouse.down()
    await page.mouse.up()
    await page.keyboard.press('ControlOrMeta+z')
    await page.keyboard.press('ControlOrMeta+v')
    await expect(more.getByRole('button', { name: 'bd step 5', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(more.getByRole('button', { name: 'sd step 5', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(more.getByRole('button', { name: 'bd step 9', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await expect(more.locator('.pad.sel')).toHaveCount(10)

    // A Shift click on a step is still a louder hit, and chooses nothing.
    await page.keyboard.down('Shift')
    await drums.getByRole('button', { name: 'bd step 13', exact: true }).click()
    await page.keyboard.up('Shift')
    await expect(drums.getByRole('button', { name: 'bd step 13', exact: true })).toHaveAttribute('data-loud', '')
})
