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

test('the columns can be dragged wider and narrower, and stay so after a restart', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Sounds', exact: true }).click()
    const soundsEdge = page.getByRole('separator', { name: 'Width of the sounds' })
    const codeEdge = page.getByRole('separator', { name: 'Width of the code' })
    const codeBefore = await width(codePane(page))
    await drag(page, soundsEdge, 60)
    expect(await width(sounds(page))).toBe(360)
    await drag(page, codeEdge, 100)
    expect(await width(codePane(page))).toBe(codeBefore - 100)
    expect(Math.round((await box(controls(page))).x)).toBe(360)

    await page.reload()
    await ready(page)
    await expect(sounds(page)).toBeVisible()
    expect(await width(sounds(page))).toBe(360)
    expect(await width(codePane(page))).toBe(codeBefore - 100)
})

