// How the window is laid out: which parts are shown and how wide the two side columns are.
// The mixer is on the left with the sounds and the jam under it, the controls in the middle, the
// code on the right. The mixer and the sounds are shown from the first start; the jam is not.
// Each of the three can be folded to its heading. A width of null means the usual one; a width that was dragged is kept in pixels. How
// the left column is shared between the sounds and the jam is kept as the part the sounds take.
export type ViewMode = 'controls' | 'both' | 'code'
export type LeftPanel = 'mixer' | 'sounds' | 'jams'
export const LEFT_PANELS: LeftPanel[] = ['mixer', 'sounds', 'jams']
export type Layout = { view: ViewMode; sounds: boolean; jams: boolean; mixer: boolean; wave: boolean; song: boolean; soundsWidth: number | null; codeWidth: number | null; soundsShare: number | null; folded: LeftPanel[] }

export const DEFAULT_LAYOUT: Layout = { view: 'both', sounds: true, jams: false, mixer: true, wave: true, song: true, soundsWidth: null, codeWidth: null, soundsShare: null, folded: [] }
export const SOUNDS_SHARE = 0.4
export const SHARE_LEAST = 0.2
export const SHARE_MOST = 0.75
export const SOUNDS_WIDTH = 300
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
            mixer: shown(kept.mixer, DEFAULT_LAYOUT.mixer),
            wave: shown(kept.wave, DEFAULT_LAYOUT.wave),
            song: shown(kept.song, DEFAULT_LAYOUT.song),
            soundsWidth: width(kept.soundsWidth),
            codeWidth: width(kept.codeWidth),
            soundsShare: share(kept.soundsShare),
            folded: LEFT_PANELS.filter((panel) => Array.isArray(kept.folded) && kept.folded.includes(panel)),
        }
    } catch {
        return DEFAULT_LAYOUT
    }
}

export const isUsual = (layout: Layout): boolean => (Object.keys(DEFAULT_LAYOUT) as (keyof Layout)[]).every((key) => (key === 'folded' ? !layout.folded.length : layout[key] === DEFAULT_LAYOUT[key]))

// The width the code column has when it was never dragged.
export const usualCode = (windowWidth: number): number => Math.max(380, Math.round(windowWidth * 0.3))

// A side column may be dragged as far as leaves the least room for what is beside it. `others`
// is the room the other shown columns need.
export function fitWidth(wanted: number, least: number, windowWidth: number, others: number): number {
    return Math.round(Math.max(least, Math.min(wanted, windowWidth - others)))
}
