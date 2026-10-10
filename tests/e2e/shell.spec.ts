import { expect, test } from '@playwright/test'

test('shows the four regions', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('top')).toBeVisible()
    await expect(page.getByTestId('controls')).toBeVisible()
    await expect(page.getByTestId('code')).toBeVisible()
    await expect(page.getByTestId('status')).toBeVisible()
    await expect(page.locator('.word')).toHaveText('Weft')
})
