import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { setVariation, variedOf, variesNotes } from '../app/controller'
import { meterNow } from '../song/meter'
import type { PatternBlock } from '../song/types'
import { CHANGES, ECHOES, EVERY_BARS, SHIFTS, SPREADS, variedCount, type Kind, type Value } from '../song/vary'
import { stale } from '../stores/song'

type Choice<T> = { label: string; value: T; title?: string }

const sixteenths = (steps: number) => (Math.abs(steps) === 2 ? 'An 8th' : Math.abs(steps) === 1 ? 'A 16th' : `${Math.abs(steps)} 16ths`)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// The ways a pattern can be varied, each a row of choices with Off first. What is chosen is a
// call in the code, and a call typed there shows here.
export function VaryMenu(props: { id: string; block: PatternBlock }) {
    let root!: HTMLSpanElement
    const [open, setOpen] = createSignal(false)
    const varied = createMemo(() => (props.block ? variedOf(props.id) : null))
    const count = () => {
        const now = varied()
        return now ? variedCount(now) : 0
    }
    const notes = createMemo(() => (open() && props.block ? variesNotes(props.id) : false))

    const away = (event: PointerEvent) => {
        if (open() && !root.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
        if (open() && event.key === 'Escape') setOpen(false)
    }
    onMount(() => {
        document.addEventListener('pointerdown', away)
        document.addEventListener('keydown', escape)
    })
    onCleanup(() => {
        document.removeEventListener('pointerdown', away)
        document.removeEventListener('keydown', escape)
    })

    const row = <K extends Kind>(kind: K, caption: string, about: string, choices: Choice<Value<K>>[]) => (
        <div class="vy-r">
            <span class="cap" title={about}>
                {caption}
            </span>
            <div class="seg s" role="radiogroup" aria-label={`${caption} for ${props.id}`}>
                <For each={choices}>
                    {(choice) => {
                        const on = () => same(varied()?.[kind] ?? null, choice.value)
                        return (
                            <button role="radio" aria-checked={on()} classList={{ on: on() }} title={choice.title} disabled={stale()} onClick={() => setVariation(props.id, kind, choice.value)}>
                                {choice.label}
                            </button>
                        )
                    }}
                </For>
            </div>
        </div>
    )
    const off = <K extends Kind>(): Choice<Value<K>> => ({ label: 'Off', value: null as Value<K> })

    return (
        <Show when={varied()}>
            <span class="vy-w" ref={root} onClick={(event) => event.stopPropagation()}>
                <button class="vy-b" classList={{ on: open(), lit: count() > 0 }} aria-haspopup="dialog" aria-expanded={open()} aria-label={`Vary ${props.id}`} title="Ways to play this pattern otherwise, now and then or all the time" onClick={() => setOpen(!open())}>
                    Vary
                    <Show when={count()}>
                        <b>{count()}</b>
                    </Show>
                </button>
                <Show when={open()}>
                    <div class="sm vy" role="dialog" aria-label={`Vary ${props.id}`}>
                        <p class="sm-note">Plays the pattern otherwise without changing what is in it. Each choice is a line in the code.</p>
                        {row(
                            'every',
                            'Every few bars',
                            'Plays the pattern otherwise in one bar out of every few',
                            [off<'every'>(), ...EVERY_BARS.map((bars) => ({ label: `${bars === 2 ? '2nd' : `${bars}th`} bar`, value: { bars, change: varied()?.every?.change ?? 'faster' } }))],
                        )}
                        <Show when={varied()?.every}>
                            {(every) =>
                                row(
                                    'every',
                                    'In that bar',
                                    'What that bar plays',
                                    CHANGES.filter((change) => notes() || !change.notesOnly).map((change) => ({ label: change.label, value: { bars: every().bars, change: change.id } })),
                                )
                            }
                        </Show>
                        {row('shift', 'Shift', 'Moves every hit along the bar', [
                            off<'shift'>(),
                            ...SHIFTS.map((steps) => ({ label: `${sixteenths(steps)} ${steps < 0 ? 'early' : 'late'}`, value: steps })),
                        ])}
                        {row('backwards', 'Backwards', 'Plays each bar from its end to its start', [
                            { label: 'Off', value: false },
                            { label: 'On', value: true },
                        ])}
                        {row('turn', 'Turn', 'Each bar starts further on, and what was cut off comes at its end', [
                            off<'turn'>(),
                            { label: 'A beat further each bar', value: meterNow().beats },
                            { label: 'A 16th further', value: meterNow().quarters * 4 },
                        ])}
                        {row('echo', 'Echo', notes() ? 'A copy of every note, an octave up, a little later' : 'A quieter copy of every hit, a little later', [
                            off<'echo'>(),
                            ...ECHOES.map((steps) => ({ label: `${sixteenths(steps)} after`, value: steps })),
                        ])}
                        <Show when={notes()}>
                            {row('spread', 'Spread evenly', 'Plays the notes on hits spread as evenly over the bar as they go', [
                                off<'spread'>(),
                                ...SPREADS.map((spread) => ({ label: `${spread[0]} in ${spread[1]}`, value: spread })),
                            ])}
                        </Show>
                    </div>
                </Show>
            </span>
        </Show>
    )
}
