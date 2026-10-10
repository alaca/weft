export type TextEdit = { from: number; to: number; insert: string }

export type PatternBlock = {
    id: string
    label: string
    muted: boolean
    labelFrom: number
    labelTo: number
    from: number
    to: number
    lineFrom: number
    lineTo: number
    soundName: string | null
}

export type Song = {
    patterns: PatternBlock[]
    error: { message: string; line: number } | null
}

export type PatternEvent = {
    start: number
    length: number
    sound: string | null
    midi: number | null
}

export type PatternView =
    | { kind: 'steps'; rows: { name: string; steps: boolean[] }[] }
    | { kind: 'notes'; lowest: number; highest: number; notes: { start: number; length: number; midi: number }[] }
    | { kind: 'empty' }
