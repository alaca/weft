import { expect, test, type Page } from '@playwright/test'

const guide = (page: Page) => page.getByTestId('guide')
const strip = (page: Page, id: string) => page.getByTestId(`strip-${id}`)
const step = async (page: Page, at: number) => expect(guide(page)).toContainText(`A first beat, ${at} of 11`, { timeout: 10000 })
const click = async (page: Page, id: string, labels: string[]) => {
    for (const label of labels) await strip(page, id).locator(`[aria-label="${label}"]`).click()
}

// The app as it is on a machine that never ran it.
async function firstStart(page: Page) {
    await page.addInitScript(() => {
        if (sessionStorage.getItem('emptied')) return
        localStorage.clear()
        sessionStorage.setItem('emptied', '1')
    })
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

test('a first beat is made with the guide, one step after another, each going on once it is done', async ({ page }) => {
    test.setTimeout(90_000)
    await firstStart(page)
    await page.getByRole('button', { name: 'Make a first beat, step by step', exact: true }).click()
    await expect(page.getByTestId('song-name')).toContainText('First beat')
    await step(page, 1)
    await expect(guide(page)).toContainText('press Drums')

    await page.getByTestId('add-pattern').getByRole('button', { name: 'Drums', exact: true }).click()
    await step(page, 2)
    await click(page, 'drums', ['bd step 1', 'bd step 5', 'bd step 9', 'bd step 13'])
    await step(page, 3)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await step(page, 4)
    await click(page, 'drums', ['cp step 5', 'cp step 13'])
    await step(page, 5)
    await click(page, 'drums', ['hh step 3', 'hh step 7', 'hh step 11', 'hh step 15'])
    await step(page, 6)

    await page.getByTestId('add-pattern').getByRole('button', { name: 'Bass line', exact: true }).click()
    await step(page, 7)
    const roll = strip(page, 'bass').locator('.nr-g')
    const box = (await roll.boundingBox())!
    for (const along of [0.03, 0.28, 0.53, 0.78]) await page.mouse.click(box.x + box.width * along, box.y + box.height * 0.6)
    await step(page, 8)
    await strip(page, 'bass').getByRole('slider', { name: 'Cutoff', exact: true }).focus()
    await page.keyboard.press('End')
    await step(page, 9)
    await guide(page).getByRole('button', { name: 'Go on', exact: true }).click()
    await step(page, 10)

    await page.getByRole('button', { name: 'Vary drums', exact: true }).click()
    const vary = page.getByRole('dialog', { name: 'Vary drums' })
    await vary.getByRole('radiogroup', { name: 'Every few bars for drums' }).getByRole('radio', { name: '4th bar' }).click()
    await vary.getByRole('radiogroup', { name: 'In that bar for drums' }).getByRole('radio', { name: 'Each hit twice' }).click()
    await step(page, 11)
    await expect(guide(page)).toContainText('That is your first beat.')
    await guide(page).getByRole('button', { name: 'Done', exact: true }).click()
    await expect(guide(page)).toHaveCount(0)
})
