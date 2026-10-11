import { expect, test, type Page } from '@playwright/test'

const SONG = 'setcpm(120/4)\n\ndrums: stack(\n  s("bd").struct("x ~ ~ ~   x ~ ~ ~   x ~ ~ ~   x ~ ~ ~"),\n)\n  .bank("RolandTR909")\n\nbass: note("c2 e2")\n  .s("sawtooth")\n  .lpf(800)\n\n\n'

const code = (page: Page) => page.evaluate(() => (window as any).__weft.engine.getCode() as string)
const browser = (page: Page) => page.getByTestId('sound-browser')

async function open(page: Page) {
    await page.addInitScript((value) => localStorage.setItem('weft.song', value), SONG)
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__weft))
    await expect(page.getByTestId('sounds')).toHaveText('Sounds ready', { timeout: 30000 })
    await page.getByRole('button', { name: 'Sounds', exact: true }).click()
}

// Where a piece of text is in the editor, so that a sound can be let go on it.
async function placeOf(page: Page, line: string, within?: string) {
    return page.evaluate(
        ([text, inside]) => {
            const row = [...document.querySelectorAll('.cm-line')].find((el) => el.textContent?.includes(text))
            if (!row) throw new Error(`no line with ${text}`)
            const box = row.getBoundingClientRect()
            if (!inside) return { x: box.right - 4, y: box.top + box.height / 2 }
            const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
            let seen = 0
            const at = (row.textContent ?? '').indexOf(inside) + Math.floor(inside.length / 2)
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const length = node.textContent?.length ?? 0
                if (seen + length > at) {
                    const range = document.createRange()
                    range.setStart(node, at - seen)
                    range.setEnd(node, at - seen + 1)
                    const spot = range.getBoundingClientRect()
                    return { x: spot.left + spot.width / 2, y: spot.top + spot.height / 2 }
                }
                seen += length
            }
            throw new Error(`no ${inside} in the line`)
        },
        [line, within ?? ''] as const,
    )
}

async function dragInto(page: Page, kind: string, sound: string, to: { x: number; y: number }) {
    await browser(page).getByRole('radio', { name: new RegExp(`^${kind}`) }).click()
    await browser(page).getByRole('searchbox', { name: 'Search sounds' }).fill(sound)
    const row = browser(page).locator('.sb-i').filter({ has: page.locator('code', { hasText: new RegExp(`^${sound}$`) }) })
    await expect(row).toHaveCount(1)
    const carried = await page.evaluateHandle(() => new DataTransfer())
    await row.dispatchEvent('dragstart', { dataTransfer: carried })
    const editor = page.locator('.cm-content')
    await editor.dispatchEvent('dragover', { dataTransfer: carried, clientX: to.x, clientY: to.y })
    await editor.dispatchEvent('drop', { dataTransfer: carried, clientX: to.x, clientY: to.y })
}

test('a sound dragged onto a pattern in the code becomes its sound', async ({ page }) => {
    await open(page)
    await dragInto(page, 'Instruments', 'gm_piano', await placeOf(page, '.lpf(800)'))
    await expect.poll(() => code(page)).toContain('bass: note("c2 e2")\n  .s("gm_piano")\n  .lpf(800)\n')
    await expect(page.getByTestId('code-status')).toHaveText('Stopped')
})

async function dragOnto(page: Page, kind: string, sound: string, target: import('@playwright/test').Locator) {
    await browser(page).getByRole('radio', { name: new RegExp(`^${kind}`) }).click()
    await browser(page).getByRole('searchbox', { name: 'Search sounds' }).fill(sound)
    const row = browser(page).locator('.sb-i').filter({ has: page.locator('code', { hasText: new RegExp(`^${sound}$`) }) })
    await expect(row).toHaveCount(1)
    const carried = await page.evaluateHandle(() => new DataTransfer())
    await row.dispatchEvent('dragstart', { dataTransfer: carried })
    await target.dispatchEvent('dragover', { dataTransfer: carried })
    const lit = await target.evaluate((el) => el.closest('[data-drop]') !== null)
    await target.dispatchEvent('drop', { dataTransfer: carried })
    await row.dispatchEvent('dragend', { dataTransfer: carried })
    return lit
}

test('a sound dragged onto a pattern in the controls becomes its sound', async ({ page }) => {
    await open(page)
    expect(await dragOnto(page, 'Instruments', 'gm_piano', page.getByTestId('strip-bass').locator('.st-h'))).toBe(true)
    await expect.poll(() => code(page)).toContain('bass: note("c2 e2")\n  .s("gm_piano")\n  .lpf(800)\n')
    expect(await dragOnto(page, 'Drum kits', 'RolandTR808', page.getByTestId('strip-drums').locator('.st-h'))).toBe(true)
    await expect.poll(() => code(page)).toContain('  .bank("RolandTR808")\n')
})
