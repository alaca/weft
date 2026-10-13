import { createMemo, createSignal, For } from 'solid-js'
import { codeNow, paintTones, setFollowerLength, setFollowerSteps, setRegister, toggleTone } from '../app/controller'
import { chordAt, readFollower, REGISTERS, TONES } from '../song/chords'
import { resample, type Grid } from '../song/grid'
import { drumSteps } from '../song/meter'
import type { PatternBlock } from '../song/types'
import { chordLane, meter, stale } from '../stores/song'
import { GridFooter } from './GridFooter'
import { StepGrid, type StepRow } from './StepGrid'

// A pattern that follows the chords of the song. Each row of its grid is a note of the chord of
// the bar, counted from the bottom, the lowest at the foot of the grid: a hit plays whichever
// note the chord has there, so the same grid plays every chord the song goes through.
export function ChordRack(props: { id: string; block: PatternBlock; head: HTMLElement; playing: boolean; position: number; cycle: number }) {
    const follower = createMemo(() => readFollower(codeNow(), props.block))
    const [page, setPage] = createSignal(0)
    const [held, setHeld] = createSignal<number | null>(null)
    const cycles = () => follower()?.cycles ?? 1
    const perCycle = () => follower()?.perCycle ?? 16
    const shown = () => Math.min(held() ?? (props.playing ? props.cycle % cycles() : page()), cycles() - 1)
    const inSight = () => shown() === props.cycle % cycles()
    const from = () => shown() * perCycle()
    // The top row is the highest note, as on a piano roll.
    const rows = createMemo((): StepRow[] => {
        const cells = follower()?.cells ?? []
        return Array.from({ length: TONES }, (_, at) => TONES - 1 - at).map((tone) => ({ name: String(tone + 1), steps: cells.slice(from(), from() + perCycle()).map((cell) => cell.includes(tone)) }))
    })
    const grid = (): Grid | null => {
        const now = follower()
        return now ? { rows: Array.from({ length: TONES }, (_, tone) => ({ sound: String(tone + 1), steps: now.cells.map((cell) => cell.includes(tone)) })), steps: now.steps, cycles: now.cycles, perCycle: now.perCycle } : null
    }
    const toneOf = (name: string) => Number(name) - 1
    const own = () => follower()?.own ?? null
    const chordNow = () => {
        const lane = chordLane()
        const kept = own()
        return kept ? kept[props.cycle % kept.length] : lane ? chordAt(lane, props.cycle) : null
    }

    return (
        <div class="rk cr" onClick={(event) => event.stopPropagation()}>
            <p class="cr-n" data-testid="chord-now">
                {own() ? (
                    <>
                        Plays chords of its own, the ones the song had. The chord of this bar is <b>{chordNow()}</b>. Add chords in the Song panel and it follows them again.
                    </>
                ) : chordNow() ? (
                    <>
                        Follows the chords of the song. The chord of this bar is <b>{chordNow()}</b>: row 1 is the note it is named after, the rows above it the next notes of the chord.
                    </>
                ) : (
                    'This pattern follows the chords of the song, and the song has none. Add chords in the Song panel.'
                )}
            </p>
            <StepGrid
                rows={rows()}
                playing={props.playing && inSight()}
                position={props.position}
                disabled={stale()}
                onToggle={(name, at) => toggleTone(props.id, toneOf(name), from() + at)}
                onPaint={(name, first, last, on) => paintTones(props.id, toneOf(name), from() + first, from() + last, on)}
                canPaint={() => follower() !== null}
                onHold={(on) => setHeld(on ? shown() : null)}
            />
            <GridFooter
                head={props.head}
                cycles={cycles()}
                perCycle={perCycle()}
                resolutions={drumSteps(meter())}
                canUse={(resolution) => {
                    const now = grid()
                    return !now || resample(now, resolution) !== null
                }}
                shown={shown()}
                disabled={stale()}
                onPage={setPage}
                onLength={(length) => {
                    setPage(0)
                    setFollowerLength(props.id, length)
                }}
                onSteps={(resolution) => setFollowerSteps(props.id, resolution)}
            >
                <div class="sl-f">
                    <span class="cap">Where it sits</span>
                    <div class="seg s" role="group" aria-label="Where the chord sits">
                        <For each={REGISTERS}>
                            {(one) => (
                                <button
                                    classList={{ on: follower()?.register === one.id }}
                                    aria-pressed={follower()?.register === one.id}
                                    title={`The note the chord is named after is at or under ${one.under}`}
                                    disabled={stale()}
                                    onClick={() => setRegister(props.id, one.id)}
                                >
                                    {one.label}
                                </button>
                            )}
                        </For>
                    </div>
                </div>
            </GridFooter>
        </div>
    )
}
