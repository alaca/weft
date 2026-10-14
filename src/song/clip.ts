import { clearStep, copyRows, STEP_KINDS, type GridRow } from './grid'
import { addNote, type Note, type NoteRef } from './notes'

// What is copied: notes, or hits of a drum grid. Each is kept at its place within the bars it
// covers, counted in bars, so that it fits a pattern with another number of steps. `from` is
// the pattern and the bar it was copied from.
export type CopiedNote = { at: number; length: number; midi: number; level?: number }
export type CopiedHit = { at: number; accent?: boolean; repeats?: number; chance?: number; lanes?: Record<string, number> }
export type Clip =
    | { kind: 'notes'; from: { id: string; bar: number }; bars: number; notes: CopiedNote[] }
    | { kind: 'hits'; from: { id: string; bar: number }; bars: number; rows: { sound: string; hits: CopiedHit[] }[] }
export type Cell = { sound: string; step: number }

export const noteKey = (note: NoteRef): string => `${note.start}:${note.midi}`

const barsOf = (first: number, end: number, perCycle: number) => {
    const bar = Math.floor(first / perCycle)
    return { bar, bars: Math.max(1, Math.ceil(end / perCycle) - bar) }
}

export function copyNotes(notes: Note[], chosen: Set<string>, perCycle: number, id: string): Clip | null {
    const picked = notes.filter((note) => chosen.has(noteKey(note)))
    if (!picked.length) return null
    const { bar, bars } = barsOf(Math.min(...picked.map((note) => note.start)), Math.max(...picked.map((note) => note.start + note.length)), perCycle)
    return {
        kind: 'notes',
        from: { id, bar },
        bars,
        notes: picked.map((note) => ({ at: note.start / perCycle - bar, length: note.length / perCycle, midi: note.midi, ...(note.level === undefined ? {} : { level: note.level }) })),
    }
}

// The notes put in from a bar on, each at its place within the bar. One that would lie over a
// note that is there, or begin past the end of the pattern, is left out; one that would run
// past the end is cut short. Null when none goes in.
export function pasteNotes(notes: Note[], clip: Extract<Clip, { kind: 'notes' }>, bar: number, steps: number, perCycle: number): { notes: Note[]; added: NoteRef[] } | null {
    let next = notes
    const added: NoteRef[] = []
    for (const one of clip.notes) {
        const start = bar * perCycle + Math.round(one.at * perCycle)
        if (start < 0 || start >= steps) continue
        const length = Math.min(steps - start, Math.max(1, Math.round(one.length * perCycle)))
        const put = addNote(next, { start, length, midi: one.midi, ...(one.level === undefined ? {} : { level: one.level }) }, steps)
        if (!put) continue
        next = put
        added.push({ start, midi: one.midi })
    }
    return added.length ? { notes: next, added } : null
}

export function copyHits(rows: GridRow[], cells: Cell[], perCycle: number, id: string): Clip | null {
    const hits = cells.filter((cell) => rows.find((row) => row.sound === cell.sound)?.steps[cell.step])
    if (!hits.length) return null
    const { bar, bars } = barsOf(Math.min(...hits.map((cell) => cell.step)), Math.max(...hits.map((cell) => cell.step + 1)), perCycle)
    return {
        kind: 'hits',
        from: { id, bar },
        bars,
        rows: rows.flatMap((row) => {
            const steps = hits.filter((cell) => cell.sound === row.sound).map((cell) => cell.step)
            if (!steps.length) return []
            return [
                {
                    sound: row.sound,
                    hits: steps.map((step) => {
                        const lanes = Object.fromEntries(Object.entries(row.lanes ?? {}).map(([fn, values]) => [fn, values[step]]))
                        return {
                            at: step / perCycle - bar,
                            ...(row.accents?.[step] ? { accent: true } : {}),
                            ...((row.repeats?.[step] ?? 1) > 1 ? { repeats: row.repeats![step] } : {}),
                            ...((row.chances?.[step] ?? 1) < 1 ? { chance: row.chances![step] } : {}),
                            ...(Object.keys(lanes).length ? { lanes } : {}),
                        }
                    }),
                },
            ]
        }),
    }
}

const usualOf = (fn: string): number => STEP_KINDS.find((kind) => kind.fn === fn)?.usual ?? 1

// The hits put in from a bar on, each with what it had of its own: louder, repeats, a chance, a
// level or a pan. A sound the grid does not have yet gets a row. Null when none goes in.
export function pasteHits(rows: GridRow[], clip: Extract<Clip, { kind: 'hits' }>, bar: number, steps: number, perCycle: number): { rows: GridRow[]; added: Cell[] } | null {
    const next = copyRows(rows)
    const added: Cell[] = []
    for (const copied of clip.rows) {
        let row = next.find((one) => one.sound === copied.sound)
        for (const hit of copied.hits) {
            const step = bar * perCycle + Math.round(hit.at * perCycle)
            if (step < 0 || step >= steps) continue
            if (!row) {
                row = { sound: copied.sound, steps: Array<boolean>(steps).fill(false) }
                next.push(row)
            }
            row.steps[step] = true
            clearStep(row, step)
            if (hit.accent) (row.accents ??= Array<boolean>(steps).fill(false))[step] = true
            if (hit.repeats) (row.repeats ??= Array<number>(steps).fill(1))[step] = hit.repeats
            if (hit.chance !== undefined) (row.chances ??= Array<number>(steps).fill(1))[step] = hit.chance
            for (const [fn, value] of Object.entries(hit.lanes ?? {})) {
                row.lanes ??= {}
                ;(row.lanes[fn] ??= Array<number>(steps).fill(usualOf(fn)))[step] = value
            }
            added.push({ sound: copied.sound, step })
        }
    }
    return added.length ? { rows: next, added } : null
}

// Hits taken out. Null when none of the cells was one.
export function clearHits(rows: GridRow[], cells: Cell[]): GridRow[] | null {
    const next = copyRows(rows)
    let changed = false
    for (const cell of cells) {
        const row = next.find((one) => one.sound === cell.sound)
        if (!row?.steps[cell.step]) continue
        row.steps[cell.step] = false
        clearStep(row, cell.step)
        changed = true
    }
    return changed ? next : null
}
