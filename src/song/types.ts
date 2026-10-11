export type TextEdit = { from: number; to: number; insert: string }

export type Arg =
    | { kind: 'number'; value: number; from: number; to: number }
    | { kind: 'slider'; value: number; min: number; max: number; from: number; to: number; valueFrom: number; valueTo: number }
    | { kind: 'string'; value: string; from: number; to: number }
    | { kind: 'chain'; calls: Call[]; root?: string; from: number; to: number }
    | { kind: 'other'; from: number; to: number }

export type Call = {
    name: string
    from: number
    to: number
    nameFrom: number
    nameTo: number
    args: Arg[]
}

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
    calls: Call[]
    inline?: boolean
    // A pattern that holds more than one version of what it plays. `calls` then begin with the
    // version that is shown, followed by what all of them share.
    variants?: Variants
}

// The versions of a pattern: the list that says which of them each bar takes, where each is in
// the code, which one is shown, and where the whole of it stands.
export type Variants = { chooser: Extract<Arg, { kind: 'string' }>; items: { from: number; to: number }[]; shown: number; from: number; to: number }

export type Tempo = { bpm: number; from: number; to: number; unit: 'cpm' | 'cps' }

export type Song = {
    patterns: PatternBlock[]
    tempo: Tempo | null
    tempoLocked: boolean
    insertAt: number
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
