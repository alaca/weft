import { kitText } from '../song/kit'
import { formatNoteGrid, type Note } from '../song/notes'
import { noteNameToMidi } from '../song/pitch'

// Songs that come with the app. Each is put together with the same writers the controls use,
// so every drum grid, piano roll and lane of a demo can be changed by clicking, like a song
// made in the app. Opening one makes a copy; the demo itself cannot be changed.
export type Demo = { id: string; name: string; about: string; code: string }

const BAR = 16
const KIT = 'RolandTR909'

type Row = [sound: string, steps: string, controls?: string]
type Played = [names: string | string[], start: number, length: number]

const hits = (text: string) => [...text.replace(/[^x.]/g, '')].map((step) => step === 'x')
const calls = (tail: string[]) => tail.map((call) => `  ${call}\n`).join('')
const plays = (runs: string) => `.mask("<${runs}>")`

// The loudest moment of a demo, everything in at a drop, has to stay below full level. Every
// volume goes through here so the mix can be set as a whole.
const LEVEL = 0.58
const vol = (level: number) => `.gain(slider(${Number((level * LEVEL).toFixed(2))}, 0, 1.5))`

function kit(name: string, rows: Row[], tail: string[]): string {
    const lines = kitText(rows.map(([sound, steps]) => ({ sound, steps: hits(steps) }))).split('\n')
    rows.forEach(([, , controls], at) => {
        if (controls) lines[at + 1] = lines[at + 1].replace(/,$/, `${controls},`)
    })
    const cycles = hits(rows[0][1]).length / BAR
    return `${name}: ${lines.join('\n')}${cycles > 1 ? `.slow(${cycles})` : ''}\n${calls([`.bank("${KIT}")`, ...tail])}`
}

function line(name: string, played: Played[], steps: number, cycles: number, tail: string[]): string {
    const notes: Note[] = played.flatMap(([names, start, length]) => [names].flat().map((pitch) => ({ midi: noteNameToMidi(pitch) ?? 60, start, length })))
    return `${name}: note(${formatNoteGrid(notes, steps)})${cycles > 1 ? `.slow(${cycles})` : ''}\n${calls(tail)}`
}

const song = (title: string, bpm: number, parts: string[]) => `// ${title}\nsetcpm(${bpm}/4)\n\n${parts.join('\n')}`

// The same figure in every bar, with the notes of that bar.
const figure = (steps: number[], length: number, bars: (string | string[])[][]): Played[] =>
    bars.flatMap((names, bar) => steps.map((step, at): Played => [names[at % names.length], bar * BAR + step, length]))

// Every demo has the same shape, 64 bars long: an opening, the beat and bass coming in, a first
// build, a drop, a breakdown, a second build and a last drop. A build is a snare roll that gets
// denser and louder and a noise that opens up, with the bass out and the kick out for its last bar.
const KICK = '0!8 1!23 0 1!16 0!8 1!8'
const BASS = '0!8 1!20 0!4 1!16 0!8 1!8'
const HATS = '0!16 1!12 0!4 1!16 0!8 1!8'
const LEAD = '0!32 1!20 0!4 1!8'
const BUILD = '0!28 1!4 0!20 1!4 0!8'
const DROPS = '0!32 1 0!23 1 0!7'

const EVERY_STEP = Array.from({ length: BAR }, (_, step) => step)
const OFF_THE_KICK = [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15]

const build = [
    kit('roll', [['sd', 'x...x...x...x... x.x.x.x.x.x.x.x. xxxxxxxxxxxxxxxx xxxxxxxxxxxxxxxx']], [`.gain(saw.range(${Number((0.2 * LEVEL).toFixed(2))}, ${Number((0.62 * LEVEL).toFixed(2))}).slow(4))`, plays(BUILD)]),
    line('riser', figure(EVERY_STEP, 1, [['c4'], ['c4'], ['c4'], ['c4']]), 64, 4, ['.s("white")', '.lpf(saw.range(300, 9000).slow(4))', `.gain(saw.range(0.02, ${Number((0.35 * LEVEL).toFixed(2))}).slow(4))`, '.decay(.08).sustain(.5)', '.room(.3)', plays(BUILD)]),
    kit('crash', [['cr', 'x...............', `${vol(0.6)}.room(0.3)`]], [plays(DROPS)]),
]

const glasshouse = song('Glasshouse', 124, [
    kit(
        'drums',
        [
            ['bd', 'x...x...x...x...', vol(0.75)],
            ['cp', '....x.......x...', `.room(0.2)${vol(0.6)}`],
        ],
        [plays(KICK)],
    ),
    kit(
        'hats',
        [
            ['hh', 'xx.xxx.xxx.xxx.x', vol(0.3)],
            ['oh', '..x...x...x...x.', vol(0.45)],
            ['rim', '.......x..x.....', vol(0.5)],
        ],
        [plays(HATS)],
    ),
    line('bass', figure(OFF_THE_KICK, 1, [['a1'], ['f1'], ['c2'], ['g1']]), 64, 4, [
        '.s("sawtooth")',
        '.lpf(slider(520, 100, 8000))',
        '.lpq(slider(6, 0, 30))',
        '.lpenv(2).decay(.14).sustain(.2)',
        vol(0.8),
        plays(BASS),
    ]),
    line(
        'pad',
        [
            [['a3', 'c4', 'e4'], 0, 4],
            [['a3', 'c4', 'f4'], 4, 4],
            [['g3', 'c4', 'e4'], 8, 4],
            [['g3', 'b3', 'd4'], 12, 4],
        ],
        16,
        4,
        ['.s("supersaw")', '.lpf(slider(1400, 100, 8000))', '.attack(.3).release(.6)', '.room(slider(0.5, 0, 1))', vol(0.35), plays('0!8 1!56')],
    ),
    line(
        'pluck',
        figure([0, 3, 6, 9, 12, 14], 2, [
            ['a4', 'e5', 'c5', 'a5', 'e5', 'c5'],
            ['a4', 'f5', 'c5', 'a5', 'f5', 'c5'],
            ['g4', 'e5', 'c5', 'g5', 'e5', 'c5'],
            ['g4', 'd5', 'b4', 'g5', 'd5', 'b4'],
        ]),
        64,
        4,
        ['.s("square")', '.lpf(slider(2200, 100, 8000))', '.decay(.18).sustain(0)', '.delay(slider(0.35, 0, 1))', '.delayfeedback(.45).delaysync(.1875)', vol(0.65)],
    ),
    line(
        'lead',
        [
            ['e5', 0, 6],
            ['d5', 6, 2],
            ['c5', 8, 6],
            ['b4', 14, 2],
            ['a4', 16, 8],
            ['c5', 24, 4],
            ['e5', 28, 4],
            ['g5', 32, 6],
            ['e5', 38, 2],
            ['d5', 40, 6],
            ['c5', 46, 2],
            ['d5', 48, 8],
            ['b4', 56, 6],
        ],
        64,
        4,
        ['.s("triangle")', '.vib(slider(5, 0, 12)).vibmod(.12)', '.attack(.02).release(.3)', '.delay(.4).room(.5)', vol(0.55), plays(LEAD)],
    ),
    ...build,
])

const lowSun = song('Low sun', 122, [
    kit(
        'drums',
        [
            ['bd', 'x...x...x...x...', vol(0.75)],
            ['cp', '....x.......x...', `.room(0.3)${vol(0.6)}`],
        ],
        [plays(KICK)],
    ),
    kit(
        'tops',
        [
            ['hh', '..x...x...x...x.', vol(0.5)],
            ['rd', 'x.x.x.x.x.x.x.x.', vol(0.2)],
            ['rim', '...x..x....x..x.', `${vol(0.45)}.pan(slider(0.7, 0, 1))`],
        ],
        [plays(HATS)],
    ),
    line(
        'bass',
        [
            ['d2', 0, 14],
            ['d2', 16, 14],
            ['a#1', 32, 14],
            ['c2', 48, 14],
        ],
        64,
        4,
        ['.s("triangle")', '.lpf(slider(420, 100, 8000))', vol(0.85), plays(BASS)],
    ),
    line('stabs', figure([3, 6, 11, 14], 1, [[['f3', 'a3', 'c4']], [['f3', 'a3', 'c4']], [['f3', 'a#3', 'd4']], [['e3', 'g3', 'c4']]]), 64, 4, [
        '.s("sawtooth")',
        '.lpf(slider(1800, 100, 8000))',
        '.lpenv(3).decay(.2).sustain(0)',
        '.room(slider(0.4, 0, 1))',
        '.delay(.3).delayfeedback(.4)',
        vol(0.62),
    ]),
    line(
        'keys',
        [
            ['a4', 0, 3],
            ['f4', 3, 3],
            ['d4', 6, 2],
            ['f4', 10, 2],
            ['a4', 12, 4],
            ['g4', 16, 3],
            ['f4', 19, 3],
            ['d4', 22, 6],
            ['a#4', 32, 3],
            ['a4', 35, 3],
            ['f4', 38, 2],
            ['d5', 42, 2],
            ['c5', 44, 4],
            ['a4', 48, 3],
            ['g4', 51, 3],
            ['e4', 54, 6],
        ],
        64,
        4,
        ['.s("sine")', '.fm(slider(2, 0, 8)).fmh(2)', '.decay(.3).sustain(.3).release(.4)', '.delay(.4).room(.5)', vol(0.55), plays('0!16 1!12 0!4 1!32')],
    ),
    ...build,
])

const nightShift = song('Night shift', 174, [
    kit(
        'drums',
        [
            ['bd', 'x.........x..... x......x..x.....', vol(0.75)],
            ['sd', '....x.......x... ....x.......x...', vol(0.7)],
            ['hh', 'x.x.x.x.x.x.x.x. x.x.x.x.x.x.x.x.', vol(0.45)],
            ['oh', '................ ..............x.', vol(0.4)],
            ['rim', '.......x.x...... .........x.....x', vol(0.35)],
        ],
        [plays(KICK)],
    ),
    line(
        'bass',
        [
            ['f1', 0, 6],
            ['f1', 6, 2],
            ['f1', 10, 4],
            ['g#1', 14, 2],
            ['f1', 16, 6],
            ['f1', 22, 2],
            ['d#1', 26, 6],
            ['c#1', 32, 6],
            ['c#1', 38, 2],
            ['c#1', 42, 4],
            ['d#1', 46, 2],
            ['c1', 48, 8],
            ['c1', 58, 2],
            ['d#1', 60, 4],
        ],
        64,
        4,
        ['.s("supersaw")', '.lpf(slider(380, 100, 8000))', '.lpq(slider(4, 0, 30))', vol(0.85), plays(BASS)],
    ),
    line(
        'pad',
        [
            [['f3', 'g#3', 'c4', 'd#4'], 0, 8],
            [['c#3', 'f3', 'g#3', 'c4'], 8, 4],
            [['c3', 'd#3', 'g3', 'a#3'], 12, 4],
        ],
        16,
        4,
        ['.s("supersaw")', '.lpf(slider(1100, 100, 8000))', '.attack(.4).release(1)', '.room(slider(0.6, 0, 1))', vol(0.35)],
    ),
    line(
        'keys',
        [
            ['g#4', 0, 3],
            ['c5', 3, 3],
            ['d#5', 6, 6],
            ['c5', 22, 2],
            ['a#4', 24, 4],
            ['g#4', 28, 4],
            ['f4', 32, 3],
            ['g#4', 35, 3],
            ['c5', 38, 6],
            ['d#5', 52, 4],
            ['c5', 56, 8],
        ],
        64,
        4,
        ['.s("sine")', '.fm(slider(1.5, 0, 8)).fmh(2)', '.decay(.4).sustain(.3).release(.5)', '.delay(.5).room(.5)', vol(0.55), plays('1!28 0!4 1!32')],
    ),
    ...build,
])

const spiral = song('Spiral', 145, [
    kit('drums', [['bd', 'x...x...x...x...', vol(0.75)]], [plays(KICK)]),
    kit(
        'hats',
        [
            ['hh', 'xxxxxxxxxxxxxxxx', vol(0.22)],
            ['oh', '..x...x...x...x.', vol(0.45)],
            ['cp', '....x.......x...', `${vol(0.5)}.room(0.2)`],
        ],
        [plays(HATS)],
    ),
    line('bass', figure(OFF_THE_KICK, 1, [['e1']]), 16, 1, [
        '.s("sawtooth")',
        '.lpf(slider(700, 100, 8000))',
        '.lpq(slider(8, 0, 30))',
        '.lpenv(3).decay(.09).sustain(0)',
        vol(0.9),
        plays(BASS),
    ]),
    line(
        'acid',
        figure(EVERY_STEP, 1, [
            ['e3', 'e4', 'e3', 'g3', 'e3', 'b3', 'e3', 'd4', 'e3', 'e4', 'e3', 'g3', 'e3', 'f4', 'e3', 'e4'],
            ['e3', 'e4', 'e3', 'g3', 'e3', 'b3', 'e3', 'd4', 'e3', 'c4', 'e3', 'b3', 'e3', 'a3', 'g3', 'f3'],
        ]),
        32,
        2,
        ['.s("square")', '.lpf(slider(900, 100, 8000))', '.lpq(slider(12, 0, 30))', '.lpenv(slider(3, 0, 8))', '.decay(.1).sustain(0)', '.delay(.2)', vol(0.55), plays('1!28 0!4 1!16 0!8 1!8')],
    ),
    line(
        'zap',
        figure([0, 3, 6, 8, 11, 14], 2, [
            ['e5', 'e5', 'f5', 'e5', 'g5', 'f5'],
            ['e5', 'e5', 'd5', 'e5', 'b4', 'd5'],
            ['e5', 'e5', 'f5', 'e5', 'g5', 'f5'],
            ['e5', 'g5', 'f5', 'e5', 'd5', 'b4'],
        ]),
        64,
        4,
        ['.s("sawtooth")', '.lpf(slider(2600, 100, 8000))', '.decay(.15).sustain(.2)', '.delay(.4).delayfeedback(.5)', '.room(.3)', vol(0.4), plays(LEAD)],
    ),
    line('pad', [[['e3', 'b3', 'e4'], 0, 4]], 4, 1, ['.s("supersaw")', '.lpf(slider(900, 100, 8000))', '.attack(.5).release(1)', '.room(.7)', vol(0.35), plays('0!28 1!4 0!16 1!8 0!8')]),
    ...build,
])

const squelch = song('Squelch', 132, [
    kit(
        'drums',
        [
            ['bd', 'x...x...x...x...', vol(0.75)],
            ['cp', '....x.......x...', `.room(0.2)${vol(0.6)}`],
        ],
        [plays(KICK)],
    ),
    kit(
        'hats',
        [
            ['hh', 'xx.xxx.xxx.xxx.x', vol(0.3)],
            ['oh', '..x...x...x...x.', vol(0.45)],
            ['rd', 'x.x.x.x.x.x.x.x.', vol(0.18)],
        ],
        [plays(HATS)],
    ),
    line(
        'acid',
        [
            ['a1', 0, 1],
            ['a1', 1, 1],
            ['a2', 2, 1],
            ['a1', 3, 1],
            ['a1', 5, 1],
            ['c2', 6, 1],
            ['a1', 7, 1],
            ['a1', 8, 1],
            ['g1', 9, 1],
            ['a1', 10, 1],
            ['a2', 11, 1],
            ['a1', 13, 1],
            ['e2', 14, 1],
            ['d2', 15, 1],
        ],
        16,
        1,
        ['.s("sawtooth")', '.lpf(slider(500, 100, 8000))', '.lpq(slider(18, 0, 30))', '.lpenv(slider(4, 0, 8))', '.decay(.12).sustain(0)', '.distort(.4)', vol(0.55)],
    ),
    line(
        'answer',
        [
            ['a2', 0, 1],
            ['a3', 2, 1],
            ['a2', 3, 1],
            ['c3', 6, 1],
            ['a2', 7, 1],
            ['a2', 8, 1],
            ['e3', 10, 1],
            ['a2', 11, 1],
            ['g2', 14, 1],
            ['a2', 15, 1],
            ['a2', 16, 1],
            ['a3', 18, 1],
            ['a2', 19, 1],
            ['d3', 22, 1],
            ['a2', 23, 1],
            ['a2', 24, 1],
            ['f3', 26, 1],
            ['e3', 27, 1],
            ['c3', 30, 1],
            ['a2', 31, 1],
        ],
        32,
        2,
        ['.s("square")', '.lpf(slider(1200, 100, 8000))', '.lpq(slider(14, 0, 30))', '.lpenv(3).decay(.1).sustain(0)', '.delay(.3)', vol(0.4), plays(LEAD)],
    ),
    line('stabs', figure([3, 11], 1, [[['a3', 'c4', 'e4']], [['a3', 'c4', 'e4']], [['g3', 'b3', 'd4']], [['f3', 'a3', 'c4']]]), 64, 4, [
        '.s("sawtooth")',
        '.lpf(slider(1800, 100, 8000))',
        '.lpenv(3).decay(.25).sustain(0)',
        '.room(.5).delay(.3)',
        vol(0.45),
        plays('0!16 1!12 0!4 1!32'),
    ]),
    ...build,
])

// Minimal techno as it was in the nineties has no rolls and no risers. It is one short figure
// that never changes while its filter slowly opens and closes, and a beat whose parts come and
// go. Its drops are the kick leaving for four bars and coming back.
const greyArea = song('Grey area', 130, [
    kit('drums', [['bd', 'x...x...x...x...', vol(0.75)]], [plays('1!28 0!4 1!16 0!8 1!8')]),
    kit(
        'hats',
        [
            ['hh', '..x...x...x...x.', vol(0.45)],
            ['rd', 'xxxxxxxxxxxxxxxx', vol(0.12)],
        ],
        [plays('0!8 1!20 0!4 1!16 0!8 1!8')],
    ),
    kit(
        'perc',
        [
            ['rim', '...x..x...x..x..', `${vol(0.4)}.pan(slider(0.3, 0, 1))`],
            ['lt', '......x......x..', vol(0.35)],
            ['mt', '...........x....', `${vol(0.3)}.pan(slider(0.7, 0, 1))`],
        ],
        [plays('0!16 1!48')],
    ),
    kit(
        'open',
        [
            ['oh', '..x...x...x...x.', vol(0.35)],
            ['cp', '....x.......x...', `.room(0.2)${vol(0.5)}`],
        ],
        [plays('0!32 1!16 0!8 1!8')],
    ),
    line('riff', figure([0, 3, 6, 10, 13], 1, [[['c4', 'd#4', 'g4']]]), 16, 1, [
        '.s("sawtooth")',
        '.lpf(sine.range(500, 2600).slow(16))',
        '.lpq(slider(10, 0, 30))',
        '.lpenv(2).decay(.12).sustain(0)',
        '.room(slider(0.25, 0, 1))',
        '.delay(.25).delayfeedback(.35)',
        vol(0.6),
    ]),
    line('bass', figure([2, 6, 10, 13, 14], 1, [['c2']]), 16, 1, ['.s("triangle")', '.lpf(slider(260, 100, 8000))', vol(0.8), plays('0!16 1!12 0!4 1!16 0!8 1!8')]),
])

export const DEMOS: Demo[] = [
    { id: 'glasshouse', name: 'Glasshouse', about: 'Melodic techno, 124 bpm', code: glasshouse },
    { id: 'low-sun', name: 'Low sun', about: 'Melodic techno, 122 bpm', code: lowSun },
    { id: 'grey-area', name: 'Grey area', about: 'Minimal techno, 130 bpm', code: greyArea },
    { id: 'squelch', name: 'Squelch', about: 'Acid techno, 132 bpm', code: squelch },
    { id: 'spiral', name: 'Spiral', about: 'Psytrance, 145 bpm', code: spiral },
    { id: 'night-shift', name: 'Night shift', about: 'Drum and bass, 174 bpm', code: nightShift },
]
