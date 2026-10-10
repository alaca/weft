import type { CheckMenuItem as Tick, Submenu as Sub } from '@tauri-apps/api/menu'

// The View menu of the desktop app's own menu bar. The system's usual menu is kept as it is,
// and what can be shown and hidden in the window is put at the top of its View menu. In a
// browser there is no such menu and nothing happens.
export type ViewItem = { id: string; text: string; checked?: () => boolean; action: () => void } | 'line'

const inDesktop = () => '__TAURI_INTERNALS__' in window

// Gives back a function that puts the ticks right again after something was shown or hidden.
export async function installViewMenu(entries: ViewItem[]): Promise<() => void> {
    if (!inDesktop()) return () => undefined
    try {
        const { Menu, Submenu, MenuItem, CheckMenuItem, PredefinedMenuItem } = await import('@tauri-apps/api/menu')
        const ticks: { item: Tick; checked: () => boolean }[] = []
        const made = []
        for (const entry of entries) {
            if (entry === 'line') {
                made.push(await PredefinedMenuItem.new({ item: 'Separator' }))
            } else if (entry.checked) {
                const item = await CheckMenuItem.new({ id: entry.id, text: entry.text, checked: entry.checked(), action: entry.action })
                ticks.push({ item, checked: entry.checked })
                made.push(item)
            } else {
                made.push(await MenuItem.new({ id: entry.id, text: entry.text, action: entry.action }))
            }
        }
        made.push(await PredefinedMenuItem.new({ item: 'Separator' }))
        const menu = await Menu.default()
        let view: Sub | null = null
        for (const item of await menu.items()) {
            if (item instanceof Submenu && (await item.text()) === 'View') view = item
        }
        if (view) await view.insert(made, 0)
        else await menu.append(await Submenu.new({ text: 'View', items: made.slice(0, -1) }))
        await menu.setAsAppMenu()
        return () => {
            for (const { item, checked } of ticks) void item.setChecked(checked()).catch(() => undefined)
        }
    } catch {
        return () => undefined
    }
}
