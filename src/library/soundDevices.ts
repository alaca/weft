import { keeping } from './kept'

// Which microphone takes are made with, and what the app plays through, when they are not the
// ones the system uses. A microphone is known by its name in the desktop app, which listens
// itself, and by what the window calls it in a browser. An output is always known by what the
// window calls it, because it is the window that plays.
export type SoundChoice = { input: string | null; output: string | null; outputName: string | null }
export type SoundDevice = { id: string; name: string }

const KEY = 'weft.sound'
const NONE: SoundChoice = { input: null, output: null, outputName: null }
const inDesktop = () => '__TAURI_INTERNALS__' in window
const text = (value: unknown): string | null => (typeof value === 'string' && value && value.length < 400 ? value : null)

export function readChoice(): SoundChoice {
    try {
        const kept = JSON.parse(keeping.getItem(KEY) ?? '{}') as Partial<SoundChoice> | null
        return { input: text(kept?.input), output: text(kept?.output), outputName: text(kept?.outputName) }
    } catch {
        return NONE
    }
}

export function keepChoice(choice: SoundChoice) {
    try {
        keeping.setItem(KEY, JSON.stringify(choice))
    } catch {
        // Not kept: the choice still holds until the app is closed.
    }
}

// How this window can be told to play through something else than the system's output: by
// telling its audio clock, which Chromium can; by playing through an audio element that is
// told, which the Mac's web view can; or not at all.
export type OutputRoute = 'clock' | 'element' | null
export const outputRoute = (): OutputRoute =>
    typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype ? 'clock' : typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype ? 'element' : null

const listed = async (kind: MediaDeviceKind): Promise<{ devices: SoundDevice[]; named: boolean }> => {
    if (!navigator.mediaDevices?.enumerateDevices) return { devices: [], named: false }
    const found = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === kind && device.deviceId && device.deviceId !== 'default' && device.deviceId !== 'communications')
    // Until the window has been let to use a microphone, it is told that there are devices and
    // neither their names nor a way to choose one.
    const named = found.some((device) => device.label)
    return { devices: named ? found.map((device) => ({ id: device.deviceId, name: device.label || 'Unnamed' })) : [], named }
}

// The microphones there are, and the one the system records from when the app can tell.
export async function listInputs(): Promise<{ devices: SoundDevice[]; usual: string | null; named: boolean }> {
    if (inDesktop()) {
        try {
            const { invoke } = await import('@tauri-apps/api/core')
            const [names, usual] = await invoke<[string[], string | null]>('sound_inputs')
            return { devices: names.map((name) => ({ id: name, name })), usual, named: true }
        } catch {
            return { devices: [], usual: null, named: false }
        }
    }
    return { ...(await listed('audioinput')), usual: null }
}

export const listOutputs = (): Promise<{ devices: SoundDevice[]; named: boolean }> => listed('audiooutput')

// A window is told the names of what it could play through only once it may use a microphone.
// This asks for one and lets it go at once. False when it was refused or there is none.
export async function askForNames(): Promise<boolean> {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
        return true
    } catch {
        return false
    }
}

type Sinkable = { setSinkId?: (id: string) => Promise<void> }

// Tells something that plays, a clock or an audio element, what to play through. An empty
// name is the system's output. False when it cannot be told, or the output is not there.
export async function playThrough(player: AudioContext | HTMLMediaElement, output: string | null): Promise<boolean> {
    const told = player as unknown as Sinkable
    if (typeof told.setSinkId !== 'function') return false
    try {
        await told.setSinkId(output ?? '')
        return true
    } catch {
        return false
    }
}
