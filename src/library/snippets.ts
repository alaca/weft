// Snippets: bits of code kept under a short name, a drum pattern or a run of effects, put into
// the code by typing the name and choosing it from what the editor offers, or from the list in
// the Code pane. Yours are kept on this machine; the app comes with a few, which a snippet of
// yours with the same name takes the place of. One that came in a pack has the pack's name.
export type Snippet = { name: string; code: string; own?: boolean; pack?: string }

export const NAME_MOST = 24
export const CODE_MOST = 20000

// A name is one word that can be typed in the code: letters, digits, _ and -, in lower case.
export const cleanSnippetName = (text: string): string =>
    text
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9_-]/g, '')
        .replace(/^[-_\d]+/, '')
        .slice(0, NAME_MOST)

export const STARTERS: Snippet[] = [
    { name: 'fourfloor', code: 'kick: s("bd*4").bank("RolandTR909")' },
    { name: 'offhats', code: 'hats: s("~ hh ~ hh ~ hh ~ hh").bank("RolandTR909").gain(0.5)' },
    { name: 'backbeat', code: 'clap: s("~ cp ~ cp").bank("RolandTR909")' },
    { name: 'dub', code: '.delay(0.6).delayfeedback(0.7).delaysync(0.1875).room(0.5)' },
    { name: 'acid', code: '.s("sawtooth").lpf(sine.range(300, 2400).slow(8)).lpq(18).lpenv(4).decay(0.15).sustain(0)' },
    { name: 'wobble', code: '.lpf(sine.range(200, 2000).fast(2)).lpq(12)' },
]

export function readSnippets(text: string | null): Snippet[] {
    try {
        const kept = JSON.parse(text ?? '[]') as unknown
        if (!Array.isArray(kept)) return []
        const seen = new Set<string>()
        return kept.flatMap((entry: { name?: unknown; code?: unknown }) => {
            const name = typeof entry?.name === 'string' ? cleanSnippetName(entry.name) : ''
            const code = typeof entry?.code === 'string' ? entry.code.slice(0, CODE_MOST) : ''
            if (!name || !code.trim() || seen.has(name)) return []
            seen.add(name)
            return [{ name, code, own: true }]
        })
    } catch {
        return []
    }
}

export const writeSnippets = (snippets: Snippet[]): string => JSON.stringify(snippets.map(({ name, code }) => ({ name, code })))

// The list with this one in it, first, in the place of one of the same name.
export const withSnippet = (snippets: Snippet[], name: string, code: string): Snippet[] => [{ name, code, own: true }, ...snippets.filter((snippet) => snippet.name !== name)]

// Yours, then those of the packs that were added, then those the app comes with: each name once,
// the first that has it.
export function allSnippets(own: Snippet[], packed: Snippet[] = []): Snippet[] {
    const taken = new Set<string>()
    return [...own, ...packed, ...STARTERS].filter((snippet) => !taken.has(snippet.name) && Boolean(taken.add(snippet.name)))
}

// The snippets whose name begins with what has been typed.
export const snippetsFor = (snippets: Snippet[], typed: string): Snippet[] => (typed ? snippets.filter((snippet) => snippet.name.startsWith(typed.toLowerCase())) : [])
