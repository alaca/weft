import type { CheckMenuItem as Tick, MenuItem as Item, Submenu as Sub } from '@tauri-apps/api/menu'

// The desktop app's own menu bar. The system's usual menu is kept as it is: what is done with a
// song is put at the top of its File menu, what can be shown and hidden in the window at the
// top of its View menu, and the docs and looking for a newer version at the top of its Help
// menu. In a browser there is no such menu and nothing happens.
export type MenuEntry = { id: string; text: string; keys?: string; checked?: () => boolean; enabled?: () => boolean; action: () => void } | 'line'

const inDesktop = () => '__TAURI_INTERNALS__' in window

// The system's own menu has File, Edit, View, Window and Help on a Mac, no View on Windows, and
// neither File nor View on Linux. One that is missing is put where it stands on a Mac, never
// after Help: before the first menu there is that comes after it.
const ORDER = ['File', 'Edit', 'View', 'Window', 'Help']
export function placeOf(name: string, names: string[]): number {
    const after = ORDER.slice(ORDER.indexOf(name) + 1)
    const at = names.findIndex((one) => after.includes(one))
    return at < 0 ? names.length : at
}

// Gives back a function that puts the ticks and what can be chosen right again after something
// changed. A File menu the system does not have, as on Linux, has no Quit of its own either, so
// it is given `quit`.
export async function installMenus(menus: Record<string, MenuEntry[]>, quit?: () => void): Promise<() => void> {
    if (!inDesktop()) return () => undefined
    try {
        const { Menu, Submenu, MenuItem, CheckMenuItem, PredefinedMenuItem } = await import('@tauri-apps/api/menu')
        const ticks: { item: Tick; checked: () => boolean }[] = []
        const gates: { item: Item | Tick; enabled: () => boolean }[] = []
        const menu = await Menu.default()
        const there = new Map<string, Sub>()
        const names: string[] = []
        for (const item of await menu.items()) {
            const text = item instanceof Submenu ? await item.text() : ''
            if (item instanceof Submenu) there.set(text, item)
            names.push(text)
        }
        for (const [name, given] of Object.entries(menus)) {
            const entries: MenuEntry[] = name === 'File' && !there.has(name) && quit ? [...given, 'line', { id: 'weft-file-quit', text: 'Quit', keys: 'CmdOrCtrl+Q', action: quit }] : given
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
            else {
                const at = placeOf(name, names)
                await menu.insert(await Submenu.new({ text: name, items: made }), at)
                names.splice(at, 0, name)
            }
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
