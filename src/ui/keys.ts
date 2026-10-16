export const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? 'Cmd' : 'Ctrl'
export const ALT = MOD === 'Cmd' ? 'Option' : 'Alt'

// On a Mac a press with Control held asks for the menu, as the other mouse button does.
export const asksForMenu = (event: MouseEvent) => event.button === 2 || (event.ctrlKey && MOD === 'Cmd')
