// How the window is laid out: which parts are shown and how wide the two side columns are.
// Sounds are on the left with the jam under them, the controls in the middle, the code on the
// right. A width of null means the usual one; a width that was dragged is kept in pixels. How
// the left column is shared between the sounds and the jam is kept as the part the sounds take.
export type ViewMode = 'controls' | 'both' | 'code'
export type Layout = { view: ViewMode; sounds: boolean; jams: boolean; wave: boolean; song: boolean; soundsWidth: number | null; codeWidth: number | null; soundsShare: number | null }

export const DEFAULT_LAYOUT: Layout = { view: 'both', sounds: false, jams: false, wave: true, song: true, soundsWidth: null, codeWidth: null, soundsShare: null }
export const SOUNDS_SHARE = 0.4
export const SHARE_LEAST = 0.2
export const SHARE_MOST = 0.75
export const SOUNDS_WIDTH = 340
export const SOUNDS_LEAST = 260
export const CODE_LEAST = 320
export const MIDDLE_LEAST = 420

const VIEWS: ViewMode[] = ['controls', 'both', 'code']
const width = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null)
const shown = (value: unknown, usual: boolean): boolean => (typeof value === 'boolean' ? value : usual)
const share = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? fitShare(value) : null)

// The sounds keep at least a fifth of the column and leave the jam at least a quarter.
export const fitShare = (wanted: number): number => Math.round(Math.max(SHARE_LEAST, Math.min(SHARE_MOST, wanted)) * 1000) / 1000

// What was kept from last time. Anything that cannot be a layout is replaced by the usual.
export function readLayout(text: string | null): Layout {
    try {
        const kept = JSON.parse(text ?? '{}') as Partial<Layout>
        return {
            view: VIEWS.includes(kept.view as ViewMode) ? (kept.view as ViewMode) : DEFAULT_LAYOUT.view,
            sounds: shown(kept.sounds, DEFAULT_LAYOUT.sounds),
            jams: shown(kept.jams, DEFAULT_LAYOUT.jams),
            wave: shown(kept.wave, DEFAULT_LAYOUT.wave),
            song: shown(kept.song, DEFAULT_LAYOUT.song),
            soundsWidth: width(kept.soundsWidth),
            codeWidth: width(kept.codeWidth),
            soundsShare: share(kept.soundsShare),
        }
    } catch {
        return DEFAULT_LAYOUT
    }
}

export const isUsual = (layout: Layout): boolean => (Object.keys(DEFAULT_LAYOUT) as (keyof Layout)[]).every((key) => layout[key] === DEFAULT_LAYOUT[key])

// The width the code column has when it was never dragged.
export const usualCode = (windowWidth: number): number => Math.max(420, Math.round(windowWidth * 0.42))

// A side column may be dragged as far as leaves the least room for what is beside it. `others`
// is the room the other shown columns need.
export function fitWidth(wanted: number, least: number, windowWidth: number, others: number): number {
    return Math.round(Math.max(least, Math.min(wanted, windowWidth - others)))
}
