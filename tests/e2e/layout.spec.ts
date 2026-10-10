import { expect, test, type Locator, type Page } from '@playwright/test'

const ready = (page: Page) => page.waitForFunction(() => Boolean((window as any).__weft))
const box = async (target: Locator) => (await target.boundingBox())!
const sounds = (page: Page) => page.getByTestId('sound-browser')
const controls = (page: Page) => page.getByTestId('controls')
const codePane = (page: Page) => page.getByTestId('code')
const width = async (target: Locator) => Math.round((await box(target)).width)

async function open(page: Page) {
    await page.goto('/')
    await ready(page)
}

async function drag(page: Page, handle: Locator, by: number) {
    const at = await box(handle)
    const x = at.x + at.width / 2
    const y = at.y + 200
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + by / 2, y, { steps: 4 })
    await page.mouse.move(x + by, y, { steps: 4 })
    await page.mouse.up()
}

test('the sounds are a column on the left, the controls are in the middle and the code is on the right', async ({ page }) => {
    await open(page)
    const before = await box(controls(page))
    expect(before.x).toBe(0)
    await page.getByRole('button', { name: 'Sounds', exact: true }).click()
    const left = await box(sounds(page))
    const middle = await box(controls(page))
    const right = await box(codePane(page))
    expect(left.x).toBe(0)
    expect(Math.round(left.width)).toBe(340)
    expect(Math.round(middle.x)).toBe(340)
    expect(Math.round(middle.x + middle.width)).toBe(Math.round(right.x))
    expect(Math.round(right.x + right.width)).toBe(1440)
    expect(Math.round(left.height)).toBe(Math.round(middle.height))
    await expect(page.getByTestId('strip-drums').getByRole('button', { name: 'Mute drums', exact: true })).toBeVisible()
})

test('the columns can be dragged wider and narrower, and stay so after a restart', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Sounds', exact: true }).click()
    const soundsEdge = page.getByRole('separator', { name: 'Width of the sounds' })
    const codeEdge = page.getByRole('separator', { name: 'Width of the code' })
    const codeBefore = await width(codePane(page))
    await drag(page, soundsEdge, 60)
    expect(await width(sounds(page))).toBe(400)
    await drag(page, codeEdge, 100)
    expect(await width(codePane(page))).toBe(codeBefore - 100)
    expect(Math.round((await box(controls(page))).x)).toBe(400)

    await page.reload()
    await ready(page)
    await expect(sounds(page)).toBeVisible()
    expect(await width(sounds(page))).toBe(400)
    expect(await width(codePane(page))).toBe(codeBefore - 100)
})

test('a column cannot be dragged so far that the others have no room', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Sounds', exact: true }).click()
    await drag(page, page.getByRole('separator', { name: 'Width of the sounds' }), 900)
    expect(await width(controls(page))).toBeGreaterThanOrEqual(420)
    await drag(page, page.getByRole('separator', { name: 'Width of the sounds' }), -900)
    expect(await width(sounds(page))).toBe(260)
    await drag(page, page.getByRole('separator', { name: 'Width of the code' }), -1200)
    expect(await width(controls(page))).toBeGreaterThanOrEqual(420)
    await drag(page, page.getByRole('separator', { name: 'Width of the code' }), 1200)
    expect(await width(codePane(page))).toBe(320)
})

test('a double click on a divider gives the usual width back, and the keyboard moves it too', async ({ page }) => {
    await open(page)
    const codeEdge = page.getByRole('separator', { name: 'Width of the code' })
    const usual = await width(codePane(page))
    await drag(page, codeEdge, -120)
    expect(await width(codePane(page))).toBe(usual + 120)
    await codeEdge.dblclick()
    expect(await width(codePane(page))).toBe(usual)
    await codeEdge.focus()
    await page.keyboard.press('ArrowLeft')
    expect(await width(codePane(page))).toBe(usual + 16)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    expect(await width(codePane(page))).toBe(usual - 16)
})

test('reset layout puts everything back, and is only offered when something was changed', async ({ page }) => {
    await open(page)
    const reset = page.getByRole('button', { name: 'Reset layout', exact: true })
    await expect(reset).toHaveCount(0)
    const usual = await width(codePane(page))
    await page.getByRole('button', { name: 'Sounds', exact: true }).click()
    await drag(page, page.getByRole('separator', { name: 'Width of the sounds' }), 60)
    await drag(page, page.getByRole('separator', { name: 'Width of the code' }), -90)
    await page.getByRole('button', { name: 'Waveform', exact: true }).click()
    await page.getByRole('button', { name: 'Controls', exact: true }).click()
    await expect(codePane(page)).toBeHidden()
    await page.reload()
    await ready(page)
    await expect(codePane(page)).toBeHidden()
    await expect(page.getByTestId('output')).toHaveCount(0)

    await reset.click()
    await expect(reset).toHaveCount(0)
    await expect(sounds(page)).toHaveCount(0)
    await expect(page.getByTestId('output')).toBeVisible()
    await expect(codePane(page)).toBeVisible()
    expect(await width(codePane(page))).toBe(usual)
    await page.getByRole('button', { name: 'Sounds', exact: true }).click()
    expect(await width(sounds(page))).toBe(340)
})

test('with only the code shown, the sounds can still be open beside it', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Sounds', exact: true }).click()
    await page.getByRole('button', { name: 'Code', exact: true }).click()
    await expect(controls(page)).toBeHidden()
    const left = await box(sounds(page))
    const right = await box(codePane(page))
    expect(Math.round(left.width)).toBe(340)
    expect(Math.round(right.x)).toBe(340)
    expect(Math.round(right.x + right.width)).toBe(1440)
})
