// MIDI keyboards. In the desktop app the app itself listens to them, because the window of a
// Mac has no way to reach one. In a browser the window's own way is used where there is one.
// Every keyboard that is plugged in is heard, the ones that come later too.
export type MidiHeard = {
    // What a keyboard sent: a key pressed or let go, a knob turned, as the bytes it sends.
    message(bytes: Uint8Array): void
    // The keyboards that are plugged in, by name, whenever that changes.
    keyboards(names: string[]): void
}

const inDesktop = () => '__TAURI_INTERNALS__' in window

async function appMidi(on: MidiHeard): Promise<() => void> {
    const { invoke, Channel } = await import('@tauri-apps/api/core')
    const heard = new Channel<ArrayBuffer | string[]>()
    heard.onmessage = (said) => (said instanceof ArrayBuffer ? on.message(new Uint8Array(said)) : Array.isArray(said) ? on.keyboards(said.filter((name) => typeof name === 'string')) : undefined)
    await invoke('midi_listen', { onMessage: heard })
    return () => void invoke('midi_stop').catch(() => undefined)
}

type WebInput = { name: string | null; state: string; onmidimessage: ((event: { data: Uint8Array | null }) => void) | null }
type WebAccess = { inputs: { values(): Iterable<WebInput> }; onstatechange: (() => void) | null }

async function windowMidi(on: MidiHeard): Promise<() => void> {
    const ask = (navigator as unknown as { requestMIDIAccess?: () => Promise<WebAccess> }).requestMIDIAccess
    if (!ask) throw new Error('This window cannot reach a MIDI keyboard.')
    const access = await ask.call(navigator)
    const bind = () => {
        const there = [...access.inputs.values()].filter((input) => input.state !== 'disconnected')
        for (const input of there) input.onmidimessage = (event) => event.data && on.message(event.data)
        on.keyboards(there.map((input) => input.name ?? 'MIDI keyboard'))
    }
    access.onstatechange = bind
    bind()
    return () => {
        access.onstatechange = null
        for (const input of access.inputs.values()) input.onmidimessage = null
    }
}

// Whether this window can hear a MIDI keyboard at all.
export const canHearMidi = (): boolean => inDesktop() || typeof (navigator as unknown as { requestMIDIAccess?: unknown }).requestMIDIAccess === 'function'

// Starts listening, and gives back what stops it.
export const hearMidi = (on: MidiHeard): Promise<() => void> => (inDesktop() ? appMidi(on) : windowMidi(on))

// What a keyboard said, as far as the app has use for it: a key pressed, with how hard, or a
// key let go. A key pressed with no force at all is how many keyboards say that it was let go.
export type MidiKey = { kind: 'down'; note: number; force: number } | { kind: 'up'; note: number }

export function readKey(bytes: Uint8Array): MidiKey | null {
    if (bytes.length < 3) return null
    const kind = bytes[0] & 0xf0
    const note = bytes[1] & 0x7f
    const force = bytes[2] & 0x7f
    if (kind === 0x90 && force > 0) return { kind: 'down', note, force: force / 127 }
    if (kind === 0x80 || kind === 0x90) return { kind: 'up', note }
    return null
}

// The sounds of a drum grid that the notes of a pad or a keyboard stand for, by the numbers
// every drum machine and pad agrees on. A note that stands for none of a grid's sounds plays
// the row it counts to, from the note of the kick up.
export const DRUM_NOTES: Record<number, string[]> = {
    35: ['bd'],
    36: ['bd'],
    37: ['rim'],
    38: ['sd'],
    39: ['cp'],
    40: ['sd'],
    41: ['lt'],
    42: ['hh'],
    43: ['lt'],
    44: ['hh'],
    45: ['mt', 'lt'],
    46: ['oh'],
    47: ['mt'],
    48: ['ht'],
    49: ['cr'],
    50: ['ht'],
    51: ['rd'],
    56: ['cb'],
    70: ['sh'],
}

export function drumFor(note: number, rows: string[]): string | null {
    const named = (DRUM_NOTES[note] ?? []).find((sound) => rows.includes(sound))
    return named ?? rows[note - 36] ?? null
}
