import type { CheckMenuItem as Tick, MenuItem as Item, Submenu as Sub } from '@tauri-apps/api/menu'

// The desktop app's own menu bar. The system's usual menu is kept as it is: what is done with a
// song is put at the top of its File menu, and what can be shown and hidden in the window at
// the top of its View menu. In a browser there is no such menu and nothing happens.
export type MenuEntry = { id: string; text: string; keys?: string; checked?: () => boolean; enabled?: () => boolean; action: () => void } | 'line'

const inDesktop = () => '__TAURI_INTERNALS__' in window

// Gives back a function that puts the ticks and what can be chosen right again after something
// changed.
export async function installMenus(menus: { File: MenuEntry[]; View: MenuEntry[] }): Promise<() => void> {
    if (!inDesktop()) return () => undefined
    try {
        const { Menu, Submenu, MenuItem, CheckMenuItem, PredefinedMenuItem } = await import('@tauri-apps/api/menu')
        const ticks: { item: Tick; checked: () => boolean }[] = []
        const gates: { item: Item | Tick; enabled: () => boolean }[] = []
        const menu = await Menu.default()
        const there = new Map<string, Sub>()
        for (const item of await menu.items()) {
            if (item instanceof Submenu) there.set(await item.text(), item)
        }
        for (const [name, entries] of Object.entries(menus)) {
            const made = []
            for (const entry of entries) {
                if (entry === 'line') {
                    made.push(await PredefinedMenuItem.new({ item: 'Separator' }))
                    continue
                }
                const about = { id: entry.id, text: entry.text, accelerator: entry.keys, enabled: entry.enabled?.() ?? true, action: entry.action }
                const item = entry.checked ? await CheckMenuItem.new({ ...about, checked: entry.checked() }) : await MenuItem.new(about)
                if (entry.checked) ticks.push({ item: item as Tick, checked: entry.checked })
                if (entry.enabled) gates.push({ item, enabled: entry.enabled })
                made.push(item)
            }
            const before = there.get(name)
            if (before) await before.insert([...made, await PredefinedMenuItem.new({ item: 'Separator' })], 0)
            else await menu.append(await Submenu.new({ text: name, items: made }))
        }
        await menu.setAsAppMenu()
        return () => {
            for (const { item, checked } of ticks) void item.setChecked(checked()).catch(() => undefined)
            for (const { item, enabled } of gates) void item.setEnabled(enabled()).catch(() => undefined)
        }
    } catch {
        return () => undefined
    }
}
