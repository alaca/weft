import type { PatternEvent, PatternView } from './types'

export const STEPS = 16

const NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']

export function noteName(midi: number): string {
    const rounded = Math.round(midi)
    return `${NAMES[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`
}

export function describe(events: PatternEvent[]): PatternView {
    const pitched = events.filter((e) => e.midi !== null)
    if (pitched.length) {
        const midis = pitched.map((e) => e.midi as number)
        return {
            kind: 'notes',
            lowest: Math.floor(Math.min(...midis)),
            highest: Math.ceil(Math.max(...midis)),
            notes: pitched.map((e) => ({ start: e.start, length: Math.min(e.length, 1 - e.start), midi: e.midi as number })),
        }
    }

    const rows: { name: string; steps: boolean[] }[] = []
    for (const event of events) {
        if (event.sound === null) continue
        let row = rows.find((r) => r.name === event.sound)
        if (!row) {
            row = { name: event.sound, steps: Array<boolean>(STEPS).fill(false) }
            rows.push(row)
        }
        row.steps[Math.min(STEPS - 1, Math.floor(event.start * STEPS + 1e-9))] = true
    }
    return rows.length ? { kind: 'steps', rows } : { kind: 'empty' }
}
