import { describe, expect, it } from 'vitest'
import { placeOf } from '../../src/desktop/menu'

describe('where a menu the system lacks is put', () => {
    it('stands where it does on a Mac, before the menus that come after it, never after Help', () => {
        // Windows has File, Edit, Window and Help.
        expect(placeOf('View', ['File', 'Edit', 'Window', 'Help'])).toBe(2)
        // Linux has Edit, Window and Help: File goes first, then View before Window.
        expect(placeOf('File', ['Edit', 'Window', 'Help'])).toBe(0)
        expect(placeOf('View', ['File', 'Edit', 'Window', 'Help'])).toBe(2)
        expect(placeOf('Help', ['File', 'Edit'])).toBe(2)
    })
})
