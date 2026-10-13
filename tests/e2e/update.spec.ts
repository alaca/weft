import { expect, test, type Page } from '@playwright/test'

const card = (page: Page) => page.getByTestId('update')

// The site is not asked in these tests: a version is put in the place of its answer.
async function open(page: Page) {
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
}

const look = (page: Page, asked: boolean) => page.evaluate((byHand) => (window as any).__weft.lookForNewVersion(byHand), asked)

test('a newer version is offered, can be left for later, and is fetched at a press', async ({ page }) => {
    await open(page)
    await expect(card(page)).toHaveCount(0)
    await page.evaluate(() => {
        ;(window as any).installed = 0
        ;(window as any).__weft.lookWith(async () => ({
            version: '9.9.9',
            notes: 'Louder meters.',
            install: async (onProgress: (done: number) => void) => {
                onProgress(0.5)
                await new Promise((resolve) => setTimeout(resolve, 400))
                ;(window as any).installed++
            },
        }))
    })
    await look(page, false)
    await expect(card(page)).toContainText('Weft Loom 9.9.9 is out')
    await expect(card(page)).toContainText('Louder meters.')
    await card(page).getByRole('button', { name: 'Later', exact: true }).click()
    await expect(card(page)).toHaveCount(0)
    expect(await page.evaluate(() => (window as any).installed)).toBe(0)

    await look(page, true)
    await card(page).getByRole('button', { name: 'Update and restart', exact: true }).click()
    await expect(card(page)).toContainText('Fetching Weft Loom 9.9.9')
    await expect(card(page).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    await expect.poll(() => page.evaluate(() => (window as any).installed)).toBe(1)
})

test('a version that cannot be put in place says why and can be tried again', async ({ page }) => {
    await open(page)
    await page.evaluate(() => {
        ;(window as any).tries = 0
        ;(window as any).__weft.lookWith(async () => ({
            version: '9.9.9',
            notes: '',
            install: async () => {
                if (++(window as any).tries === 1) throw new Error('the file was cut short')
            },
        }))
    })
    await look(page, false)
    await card(page).getByRole('button', { name: 'Update and restart', exact: true }).click()
    await expect(card(page)).toContainText('Weft Loom 9.9.9 could not be put in place: the file was cut short. The Weft Loom you have is as it was.')
    await card(page).getByRole('button', { name: 'Try again', exact: true }).click()
    await expect.poll(() => page.evaluate(() => (window as any).tries)).toBe(2)
    await expect(card(page)).toContainText('Fetching Weft Loom 9.9.9')
})
