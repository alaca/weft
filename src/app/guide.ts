import { batch } from 'solid-js'
import { callFor, valueArg } from '../controls/views'
import { freeTitle } from '../library/shelf'
import { readKit } from '../song/kit'
import { variedCount } from '../song/vary'
import { guideGood, guideStep, setGuideGood, setGuideStep } from '../stores/guide'
import { currentSong, engineState, song, songs } from '../stores/song'
import { MOD } from '../ui/keys'
import { eventsOf, newSong, renameSong, setPlayMode, variedOf } from './controller'

// A first beat, made with someone showing the way: a new song, and a card that says what to
// do next and points at where, then goes on by itself once it is done. Nothing is done for
// you; every step is the app as it always is.
export type GuideStep = { text: string; target: () => Element | null; begin?: () => void; done?: () => boolean; next?: string }

const inStrip = (id: string | null, selector: string) => (id ? document.querySelector(`[data-testid="strip-${id}"] ${selector}`) : null)
const chip = (label: string) => [...document.querySelectorAll('[data-testid="add-pattern"] button')].find((button) => button.textContent?.trim() === label) ?? null
const hits = (id: string | null, sound: string) => (id ? eventsOf(id, 0).filter((event) => event.sound === sound).length : 0)

let guided: string | null = null
let drums: string | null = null
let bass: string | null = null
let cutoff: number | null = null

const cutoffNow = (): number | null => {
    const block = song().patterns.find((pattern) => pattern.id === bass)
    const arg = block ? valueArg(callFor(block, 'lpf')) : null
    return arg ? arg.value : null
}

export const GUIDE: GuideStep[] = [
    {
        text: 'Add some drums: press Drums.',
        target: () => chip('Drums'),
        done: () => Boolean((drums = song().patterns.find((pattern) => readKit(pattern))?.id ?? null)),
    },
    {
        text: 'Put a kick on every beat: click the 1st, 5th, 9th and 13th step of the bd row.',
        target: () => inStrip(drums, '[aria-label="bd step 1"]'),
        done: () => hits(drums, 'bd') >= 4,
    },
    {
        text: 'Press Play, or Space, to hear it. It goes round and round.',
        target: () => document.querySelector('button[aria-label="Play"]'),
        done: () => engineState().playing,
    },
    {
        text: 'A clap on the 2nd and 4th beat: the 5th and 13th step of the cp row.',
        target: () => inStrip(drums, '[aria-label="cp step 5"]'),
        done: () => hits(drums, 'cp') >= 2,
    },
    {
        text: 'Now some hats. The 3rd, 7th, 11th and 15th step of the hh row give an offbeat.',
        target: () => inStrip(drums, '[aria-label="hh step 3"]'),
        done: () => hits(drums, 'hh') >= 2,
    },
    {
        text: 'Add a bass line: press Bass line.',
        target: () => chip('Bass line'),
        done: () => Boolean((bass = song().patterns.find((pattern) => pattern.id !== drums && !readKit(pattern))?.id ?? null)),
    },
    {
        text: 'Click in its roll to put in three or four notes. Click a note again to take it out.',
        target: () => inStrip(bass, '.nr-g'),
        done: () => Boolean(bass && eventsOf(bass, 0).filter((event) => event.midi !== null).length >= 3),
    },
    {
        text: 'Turn the Cutoff knob of the bass and hear it open up.',
        target: () => inStrip(bass, '[role="slider"][aria-label="Cutoff"]'),
        begin: () => (cutoff = cutoffNow()),
        done: () => {
            const now = cutoffNow()
            return now !== null && cutoff !== null && now !== cutoff
        },
    },
    {
        text: `Everything you did is written in the code, on the right: the code is the song. Change a number there and press ${MOD} Enter, or go on.`,
        target: () => document.querySelector('[data-testid="code"] .ed'),
        next: 'Go on',
    },
    {
        text: 'For a fill: press Vary on the drums, choose Every 4th bar, then Each hit twice.',
        target: () => (drums ? document.querySelector(`button[aria-label="Vary ${drums}"]`) : null),
        done: () => {
            const varied = drums ? variedOf(drums) : null
            return Boolean(varied && variedCount(varied))
        },
    },
    {
        text: 'That is your first beat. It is kept as you go. To make a song of it, switch to Song and fill its bars in the Song panel; the Docs in the Help menu show the rest.',
        target: () => null,
        next: 'Done',
    },
]

let timer = 0
const GOOD_FOR = 700

// Looks a few times a second whether the step is done. What a pattern plays is known only once
// the song is played again after a change, a moment after the code says so. A step that is done
// is shown done for a moment before the next comes.
function watch() {
    window.clearInterval(timer)
    timer = window.setInterval(() => {
        const at = guideStep()
        if (at === null) return window.clearInterval(timer)
        if (currentSong()?.id !== guided) return stopGuide()
        if (guideGood() || !GUIDE[at].done?.()) return
        setGuideGood(true)
        window.setTimeout(() => {
            if (guideStep() !== at) return
            setGuideGood(false)
            goOn()
        }, GOOD_FOR)
    }, 250)
}

function show(at: number) {
    GUIDE[at].begin?.()
    batch(() => {
        setGuideGood(false)
        setGuideStep(at)
    })
}

export function startGuide() {
    newSong()
    const made = currentSong()
    if (!made) return
    renameSong(made.id, freeTitle('First beat', songs().map((each) => each.name)))
    setPlayMode('live')
    guided = made.id
    drums = bass = null
    cutoff = null
    show(0)
    watch()
}

export function goOn() {
    const at = guideStep()
    if (at === null) return
    if (at + 1 >= GUIDE.length) return stopGuide()
    show(at + 1)
}

export function stopGuide() {
    window.clearInterval(timer)
    guided = null
    batch(() => {
        setGuideGood(false)
        setGuideStep(null)
    })
}
