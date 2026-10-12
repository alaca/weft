// The pages of the site, as text. Every function here is handed what a page shows and hands
// back the page; nothing is read or kept here. Whatever goes into a page through `html` is
// escaped, so words a person typed never become markup, in text or in an attribute. Only what
// `html` made itself, or what `safe` was given by this file, goes in as it is.
import { DOCS, DOCS_ABOUT, type DocPicture } from './docs'

class Markup {
    constructor(readonly text: string) {}
}

const escaped = (text: string) => text.replace(/[&<>"']/g, (sign) => `&#${sign.charCodeAt(0)};`)

const put = (value: unknown): string => {
    if (value instanceof Markup) return value.text
    if (Array.isArray(value)) return value.map(put).join('')
    if (value === null || value === undefined || value === false) return ''
    return escaped(String(value))
}
const html = (parts: TemplateStringsArray, ...values: unknown[]) => new Markup(parts.reduce((text, part, at) => text + put(values[at - 1]) + part))
const safe = (text: string) => new Markup(text)

export type Platform = 'macos' | 'windows' | 'linux'
export type Build = { platform: Platform; version: string; bytes: number }
// What stands around every page. `source` is where the app's source code can be read; the
// link to it is left out until there is such a place. `origin` is the address people reach the
// site at, for the few places where a page has to give an address in full.
export type Around = { source?: string; origin?: string }
// `tint` picks the colour of the disc that stands for a person, 0 to 5.
export type Maker = { id: string; name: string; tint: number }
export type Part = { name: string; sound: string; own: boolean }
export type OwnSound = { name: string; kind: string; seconds: number; bytes: number; usedBy: number[] }
export type Preview = { seconds: number | null; peaks: number[] }
export type Listed = {
    id: string
    name: string
    by: Maker
    style: string
    tempo: number | null
    patterns: number
    // How long the whole song lasts, in seconds, when its tempo is known.
    length: number | null
    bytes: number
    published: number
    plays: number
    downloads: number
    preview: Preview
}
// A song as a line of another song's page names it.
export type Named = { id: string; name: string; by: Maker }
export type Shown = Listed & {
    description: string
    licence: string
    previewFrom: number
    bars: number | null
    parts: Part[]
    sounds: OwnSound[]
    fileName: string
    // The song this one was made from, or `gone` when that song is no longer shown.
    from: Named | 'gone' | null
    // The songs that were made from this one.
    made: Named[]
}
export type Search = { q: string; sort: 'newest' | 'downloads'; from: number | null; to: number | null; page: number }
export type Found = { songs: Listed[]; total: number; pages: number; slowest: number | null; fastest: number | null }

export const REASON_LIMIT = 500
// How large the picture of a song is, which its page says along with where the picture is.
export const PICTURE = { width: 1200, height: 630 }

const PLATFORMS: { id: Platform; name: string }[] = [
    { id: 'macos', name: 'macOS' },
    { id: 'windows', name: 'Windows' },
    { id: 'linux', name: 'Linux' },
]
// What each build is for, and what its system does the first time it is opened. None of them is
// signed with the maker of its system, and each system says so in its own way.
const FIRST_TIME: Record<Platform, string> = {
    macos: 'For Macs with Apple or Intel chips. This build is not signed with Apple yet, so macOS will not open it the first time. Try to open it once, then go to System Settings, Privacy and Security, and press Open Anyway.',
    windows: 'For Windows 10 and 11, 64 bit. This build is not signed with Microsoft yet, so Windows says it does not know it. Press More info, then Run anyway.',
    linux: 'An AppImage for 64 bit Linux: make the file executable, then run it. For sound it uses the GStreamer plugins that most desktops come with (the base and the good set). A jam has no voice and no camera on Linux, because the window Weft runs in there cannot make a call.',
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MB = 1024 * 1024

// What each licence lets whoever downloads a song do with it, in one sentence.
const LICENCE_WORDS: Record<string, (by: string) => string> = {
    'CC BY 4.0': (by) => `You may rework this song and share what you make, as long as you credit ${by}.`,
    'CC BY-SA 4.0': (by) => `You may rework this song and share what you make, as long as you credit ${by} and what you make carries this licence too.`,
    CC0: (by) => `You may do anything with this song. You do not have to credit ${by}.`,
}

const day = (at: number) => {
    const date = new Date(at)
    return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
const size = (bytes: number, digits = 1) => (bytes < 100 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / MB).toFixed(digits)} MB`)
const many = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`
const bpm = (tempo: number) => `${Math.round(tempo)} bpm`
const ofSeconds = (seconds: number) => {
    const shown = seconds >= 10 ? Math.round(seconds) : Math.round(seconds * 10) / 10
    return many(shown, 'second')
}
// The length of a song the way the app says it beside the song's bars.
const lasting = (seconds: number) => (seconds < 100 ? many(Math.round(seconds), 'second') : `${Math.floor(Math.round(seconds) / 60)} min ${Math.round(seconds) % 60} s`)
const initial = (name: string) => ([...name.trim()][0] ?? '?').toUpperCase()
// The start of a text that is longer than so many letters, up to a whole word, marked as cut.
const startOf = (text: string, most: number) => ([...text].length <= most ? text : `${[...text].slice(0, most).join('').replace(/ \S*$/, '')}…`)
const hue = (at: number) => `c${at % 5}`

const DOWN = safe('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13.5h10" /></svg>')
const PLAY = safe('<svg class="pl" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6L13 8z" /></svg><svg class="pa" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.4 3h2.6v10H4.4zM9 3h2.6v10H9z" /></svg>')
const OUT = safe('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 2.5h4v4M13.5 2.5 8 8M6.5 3.5h-3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" /></svg>')
const FLAG = safe('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 14V2.5M3.5 3h8.5l-1.8 2.75L12 8.5H3.5" /></svg>')
const TURN = safe('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v6a3 3 0 0 0 3 3h5.5M10 9l2.5 2.5L10 14" /></svg>')
const FIND = safe('<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg>')
// The mark of the app, as its icon has it, without the tile under it.
const MARK = safe('<svg class="mark" viewBox="222 300 580 424" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-width="56"><path d="M250 372h524" stroke="#e5583f" /><path d="M250 512h524" stroke="#ecb739" /><path d="M250 652h524" stroke="#79b4f2" /></g><g fill="#ece6d6"><rect x="352" y="300" width="56" height="424" rx="28" /><rect x="484" y="300" width="56" height="424" rx="28" /><rect x="616" y="300" width="56" height="424" rx="28" /></g></svg>')
const SOUND = safe('<svg viewBox="0 0 20 14"><path d="M1 6v2M4.6 3.5v7M8.2 1v12M11.8 4v6M15.4 2.5v9M19 6v2" /></svg>')

const disc = (who: Maker, small = false) => html`<i class="av${small ? ' xs' : ''}${who.tint ? ` w${who.tint}` : ''}">${initial(who.name)}</i>`
// A maker's name, which leads to the page of their songs.
const nameLink = (who: Maker) => html`<a href="/by/${who.id}">${who.name}</a>`
const sourceLink = (around: Around, more = '') => (around.source ? html`<a${safe(more)} href="${around.source}" rel="noopener">Source code</a>` : '')

// What a page says of itself for wherever its address is pasted, so that it is shown there with
// a name, a line about it and a picture. An address in it has to be given in full, so the
// picture is left out where the site was not told its own address.
const pasted = (around: Around, title: string, about: string, picture = '/app-1.png') => html`<meta property="og:title" content="${title}">
<meta property="og:description" content="${about}">
<meta property="og:site_name" content="Weft">
${around.origin ? html`<meta property="og:image" content="${around.origin}${picture}">
` : ''}`

function layout(around: Around, page: string, title: string, main: Markup, defs: Markup | '' = '', head: Markup | '' = ''): string {
    return html`<!doctype html>
<html lang="en" data-page="${page}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${head}<link rel="icon" type="image/svg+xml" href="/icon.svg">
<link rel="stylesheet" href="/site.css">
<script src="/site.js" defer></script>
</head>
<body>
${defs}
<header class="hd">
    <div class="wrap hd-in">
        <a class="word" href="/" aria-label="Weft, home">${MARK}Weft</a>
        <nav class="nav" aria-label="Site">
            <a href="/songs" data-nav="songs">Songs</a>
            <a href="/docs" data-nav="docs">Docs</a>
            <a href="/download" data-nav="download">Download</a>
            ${sourceLink(around, ' data-nav="source"')}
        </nav>
    </div>
</header>
${main}
<footer class="ft">
    <div class="wrap ft-in">
        <a class="word" href="/" aria-label="Weft, home">${MARK}Weft</a>
        <p>Free and open source. Sound engine: Strudel.</p>
        <span class="grow"></span>
        <nav aria-label="Footer">
            <a href="/songs">Songs</a>
            <a href="/docs">Docs</a>
            <a href="/download">Download</a>
            ${sourceLink(around)}
            <a href="/licence">Licence</a>
            <a href="/privacy">Privacy</a>
        </nav>
    </div>
</footer>
</body>
</html>
`.text
}

// How far each of a row of strokes reaches up and down from the middle, of the twenty units
// there are to either side: as far as the preview is loud there. A song whose loudness was
// never sent gets an even row of low strokes.
export const reach = (peaks: number[], count: number): number[] =>
    Array.from({ length: count }, (_, at) => {
        const from = Math.floor((at * peaks.length) / count)
        const to = Math.max(from + 1, Math.floor(((at + 1) * peaks.length) / count))
        return peaks.length ? 2.2 + Math.max(...peaks.slice(from, to)) * 14.8 : 3
    })

// The preview as a row of upright strokes, one every four units as in the drawings.
function strokes(peaks: number[], count: number): string {
    const tenth = (value: number) => Math.round(value * 10) / 10
    return reach(peaks, count).map((half, at) => `M${at * 4 + 2} ${tenth(20 - half)}V${tenth(20 + half)}`).join('')
}
const waveDef = (id: string, peaks: number[], count: number) => html`<path id="${id}" vector-effect="non-scaling-stroke" d="${strokes(peaks, count)}" />`
const waveUse = (id: string, count: number, kind = '') => html`<svg${kind ? html` class="${kind}"` : ''} viewBox="0 0 ${count * 4} 40" preserveAspectRatio="none"><use href="#${id}" /></svg>`
const defsOf = (paths: Markup[]) => (paths.length ? html`<svg class="defs" width="0" height="0" aria-hidden="true"><defs>${paths}</defs></svg>` : '')

// The button that plays a preview is a link to the preview itself, so it works where the
// script does not run: the browser then plays the file. The script takes the press over.
const playLink = (song: Listed) => html`<a class="play" href="/songs/${song.id}.mp3" aria-label="Play the preview of ${song.name}">${PLAY}</a>`
// What holds a play button says so, and how long its preview is, for the script that draws the
// progress there.
const holds = (song: Listed) => html` data-player${song.preview.seconds ? html` data-seconds="${song.preview.seconds}"` : ''}`

function row(song: Listed, whole = false): Markup {
    const seconds = song.preview.seconds
    const told = (count: number, one: string) => (whole ? html`${many(count, one)}` : html`${count}<small> ${one}${count === 1 ? '' : 's'}</small>`)
    return html`<li class="row"${holds(song)}>
                ${playLink(song)}
                <div class="row-t">
                    <h3><a href="/songs/${song.id}">${song.name}</a></h3>
                    <span class="by">${disc(song.by, true)}${nameLink(song.by)}<span class="num at"><span data-now>0:00</span>${seconds ? ` of ${clock(seconds)}` : ''}</span></span>
                </div>
                <div class="row-m">
                    <span>${song.style ? html`<a class="chip" href="/songs?q=${encodeURIComponent(song.style)}" title="Songs tagged ${song.style}">${song.style}</a>` : ''}</span>
                    <span class="num">${song.tempo ? bpm(song.tempo) : ''}</span>
                    <span class="num">${told(song.patterns, 'pattern')}</span>
                    <span class="num">${song.length ? clock(Math.round(song.length)) : ''}</span>
                    <span class="num">${told(song.downloads, 'download')}</span>
                </div>
                <a class="btn sm" href="/songs/${song.id}.weft" aria-label="Download ${song.name} as a .weft file">${DOWN}.weft</a>
            </li>`
}

function pick(song: Listed): Markup {
    return html`<li class="card pick"${holds(song)}>
                <div class="pick-h">
                    ${playLink(song)}
                    <div>
                        <h3><a href="/songs/${song.id}">${song.name}</a></h3>
                        <span class="by">${disc(song.by, true)}${nameLink(song.by)}</span>
                    </div>
                </div>
                <div class="wave" aria-hidden="true">
                    ${waveUse(`w-${song.id}`, 44)}
                    <div class="wave-p">${waveUse(`w-${song.id}`, 44)}</div>
                </div>
                <div class="pick-f">
                    ${song.style ? html`<span class="chip">${song.style}</span>` : ''}
                    <span class="num">${song.tempo ? bpm(song.tempo) : ''}</span>
                    <span class="grow"></span>
                    <a class="ib" href="/songs/${song.id}.weft" aria-label="Download ${song.name} as a .weft file" title="Download .weft">${DOWN}</a>
                </div>
            </li>`
}

export function homePage(around: Around, songs: Listed[], builds: Build[]): string {
    const title = 'Weft, build songs from patterns'
    const about = 'Weft is a free desktop app for pattern music, built on Strudel. Click drums into a grid, draw notes in a piano roll, turn a knob, and the code follows.'
    const get = (platform: Platform) => (builds.some((build) => build.platform === platform) ? `/download/${platform}` : '/download')
    const defs = defsOf(songs.map((song) => waveDef(`w-${song.id}`, song.preview.peaks, 44)))
    const main = html`<main>
    <section class="hero wrap">
        <h1>Weave songs from patterns.</h1>
        <p class="lede">${about} Change the code, and the controls follow. Play alone, or jam on one song with someone else.</p>
        <div class="dl" id="download">
            <a class="btn go" href="${get('macos')}">${DOWN}Download for macOS</a>
            <a class="btn" href="${get('windows')}">Windows</a>
            <a class="btn" href="${get('linux')}">Linux</a>
        </div>
        <p class="mono">Free. No account needed to make music.</p>
        <div class="shots" data-shots>
            <div class="shots-row" tabindex="0" aria-label="Pictures of the app, three of them, side by side">
                <figure id="shot-1">
                    <img src="/app-1.webp" width="1440" height="900" alt="The Weft window while a song plays: the mixer and the sounds on the left, the song laid out bar by bar and a drum grid in the middle, the song's code on the right.">
                    <figcaption>The song bar by bar, grids and knobs under it, the code on the right. They are the same song.</figcaption>
                </figure>
                <figure id="shot-2">
                    <img src="/app-2.webp" width="1440" height="900" loading="lazy" alt="A melody drawn as notes in a piano roll, with the controls of its sound open under it and the list of instruments beside it.">
                    <figcaption>Draw a melody as notes, and shape its sound with a knob for every number.</figcaption>
                </figure>
                <figure id="shot-3">
                    <img src="/app-3.webp" width="1440" height="900" loading="lazy" alt="Two people in a jam on one song: who they are, what they wrote to each other, and which pattern the other one just changed.">
                    <figcaption>Jam with someone on one song, with chat, voice and a camera.</figcaption>
                </figure>
            </div>
            <nav class="shots-nav" aria-label="Which picture">
                <a href="#shot-1" aria-current="true" aria-label="First picture: controls and code"></a>
                <a href="#shot-2" aria-label="Second picture: notes and sound"></a>
                <a href="#shot-3" aria-label="Third picture: a jam"></a>
            </nav>
        </div>
    </section>

    <section class="sec wrap" aria-labelledby="h-songs">
        <div class="sec-h">
            <div>
                <h2 id="h-songs">Songs made in Weft</h2>
                <p>${songs.length ? 'Play a preview. Download the song and open it in the app.' : 'Nothing is published yet.'}</p>
            </div>
            <a class="btn" href="/songs">All songs</a>
        </div>
        ${songs.length ? html`<ul class="picks">
            ${songs.map(pick)}
        </ul>` : ''}
    </section>

    <section class="sec wrap" aria-labelledby="h-app">
        <div class="sec-h">
            <h2 id="h-app">In the app</h2>
        </div>
        <ul class="feats">
            <li class="card feat">
                <div class="feat-i" aria-hidden="true">
                    <svg viewBox="0 0 32 32" fill="none" stroke-linecap="round"><path d="M7.87 25.13a11.5 11.5 0 1 1 16.26 0" stroke="var(--cloth-3)" stroke-width="3" /><path d="M7.87 25.13A11.5 11.5 0 0 1 21.75 7.04" stroke="var(--saffron)" stroke-width="3" /><circle cx="16" cy="17" r="6.2" fill="var(--cloth-3)" /><path d="M16 17l2.6-4.5" stroke="var(--linen)" stroke-width="2.2" /></svg>
                </div>
                <h3>Controls and code</h3>
                <p>A knob changes the code. The code moves the knob.</p>
            </li>
            <li class="card feat">
                <div class="feat-i" aria-hidden="true">
                    <svg viewBox="0 0 32 32"><g fill="var(--cloth-3)"><rect x="9.75" y="6" width="5.5" height="9" rx="1.6" /><rect x="16.75" y="6" width="5.5" height="9" rx="1.6" /><rect x="2.75" y="17" width="5.5" height="9" rx="1.6" /><rect x="16.75" y="17" width="5.5" height="9" rx="1.6" /></g><g fill="var(--madder)"><rect x="2.75" y="6" width="5.5" height="9" rx="1.6" /><rect x="23.75" y="6" width="5.5" height="9" rx="1.6" /><rect x="9.75" y="17" width="5.5" height="9" rx="1.6" /><rect x="23.75" y="17" width="5.5" height="9" rx="1.6" /></g></svg>
                </div>
                <h3>Grids and piano rolls</h3>
                <p>Click steps for drums and notes for melodies. Nothing to learn first.</p>
            </li>
            <li class="card feat">
                <div class="feat-i" aria-hidden="true">
                    <svg viewBox="0 0 32 32" fill="none" stroke="var(--woad)" stroke-width="2.4" stroke-linecap="round"><path d="M4 13v6M8.8 9v14M13.6 5v22M18.4 10v12M23.2 7v18M28 13v6" /></svg>
                </div>
                <h3>Sounds of your own</h3>
                <p>Add audio files or record from the microphone.</p>
            </li>
            <li class="card feat">
                <div class="feat-i" aria-hidden="true">
                    <svg viewBox="0 0 32 32" fill="none" stroke="var(--linen-2)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 4H9.5A1.5 1.5 0 0 0 8 5.5v21A1.5 1.5 0 0 0 9.5 28h13a1.5 1.5 0 0 0 1.5-1.5V10zM18 4v6h6" /><circle cx="16" cy="19.5" r="3" fill="var(--lichen)" stroke="none" /></svg>
                </div>
                <h3>One file to share</h3>
                <p>A .weft file holds the song, its code and your sounds.</p>
            </li>
            <li class="card feat">
                <div class="feat-i" aria-hidden="true">
                    <svg viewBox="0 0 32 32" fill="none" stroke="var(--linen-2)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="11.5" cy="12" r="4" /><path d="M4 26c.8-5 3.8-7 7.5-7s6.7 2 7.5 7" /><circle cx="22" cy="12.5" r="3.2" stroke="var(--woad)" /><path d="M22.5 19c3 .3 5 2.2 5.6 6" stroke="var(--woad)" /></svg>
                </div>
                <h3>Jams</h3>
                <p>Two people on one song at once, by invite or from the list of people open to jam, with chat and voice.</p>
            </li>
            <li class="card feat">
                <div class="feat-i" aria-hidden="true">
                    <svg viewBox="0 0 32 32" fill="none" stroke="var(--linen-2)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9h12M6 16h12M6 23h8" /><path d="M22 13.5v9l7-4.5z" fill="var(--saffron)" stroke="none" /></svg>
                </div>
                <h3>Songs to open</h3>
                <p>Hear what others published, open a copy, and see how it is made.</p>
            </li>
        </ul>
    </section>

    <section class="sec wrap">
        <div class="card end">
            <h2>Free and open source.</h2>
            <p>Licensed AGPL-3.0-or-later. An account is only for publishing songs.</p>
            <div class="dl">
                <a class="btn go" href="/download">Download</a>
                ${sourceLink(around, ' class="btn"')}
            </div>
        </div>
    </section>
</main>`
    return layout(around, 'home', title, main, defs, pasted(around, title, about))
}

export function downloadPage(around: Around, builds: Build[]): string {
    const about = 'Weft is a desktop app. It is free, and it needs no account to make music.'
    const one = (platform: { id: Platform; name: string }) => {
        const build = builds.find((made) => made.platform === platform.id)
        if (!build) return html`<li><div><b>${platform.name}</b><p>Not out yet.</p></div></li>`
        return html`<li>
                <div>
                    <b>${platform.name}</b>
                    <p><span class="num">Version ${build.version}, ${size(build.bytes)}</span></p>
                    <p>${FIRST_TIME[platform.id]}</p>
                    ${platform.id === 'macos' ? '' : html`<p>This build is new. If something does not work, ${around.source ? html`say so where the <a href="${around.source}" rel="noopener">source code</a> is` : 'say so'}.</p>`}
                </div>
                <a class="btn go" href="/download/${platform.id}" aria-label="Download Weft for ${platform.name}">${DOWN}Download</a>
            </li>`
    }
    const main = html`<main class="wrap page">
    <div class="ph">
        <div>
            <h1>Download</h1>
            <p>${about}</p>
        </div>
    </div>
    <ul class="card plats">
        ${PLATFORMS.map(one)}
    </ul>
    ${builds.length ? '' : html`<p class="tail">Weft is not released yet, so there is nothing to download.</p>`}
</main>`
    return layout(around, 'download', 'Download, Weft', main, '', pasted(around, 'Download Weft', about))
}

export function licencePage(around: Around, licences: readonly string[]): string {
    const main = html`<main class="wrap page mid">
    <div class="card note wide">
        <h1>Licence</h1>
        <p>Weft is free and open source. It is licensed AGPL-3.0-or-later, the GNU Affero General Public License, version 3 or any later version.</p>
        <h2>The songs</h2>
        <p>A song on this site carries the licence its maker chose for it, one of these. The song's page says which.</p>
        <dl>
            ${licences.map((licence) => html`<dt>${licence}</dt><dd>${LICENCE_WORDS[licence]?.('its maker') ?? ''}</dd>`)}
        </dl>
    </div>
</main>`
    return layout(around, 'licence', 'Licence, Weft', main)
}

// How the app works. Each part is headed the way a pattern is in the app, with a dot of the
// colour a pattern in that place would have.
export function docsPage(around: Around): string {
    const picture = (shown: DocPicture) => html`<figure class="docs-f"><a href="${shown.file}" aria-label="The picture in full size"><img src="${shown.file}" width="${shown.width}" height="${shown.height}" loading="lazy" alt="${shown.alt}"></a></figure>`
    const main = html`<main class="wrap page">
    <div class="ph">
        <div>
            <h1>Docs</h1>
            <p>How Weft works, one thing at a time.</p>
        </div>
    </div>
    <div class="docs">
        <nav class="docs-n" aria-label="On this page">
            ${DOCS.map((part, at) => html`<a href="#${part.id}"><i class="${hue(at)}"></i>${part.title}</a>`)}
        </nav>
        <div class="docs-b">
            ${DOCS.map((part, at) => html`<section id="${part.id}" aria-labelledby="h-${part.id}">
                <h2 id="h-${part.id}"><i class="${hue(at)}"></i>${part.title}</h2>
                ${safe(part.html)}
                ${part.pictures.map(picture)}
            </section>`)}
        </div>
    </div>
</main>`
    return layout(around, 'docs', 'Docs, Weft', main, '', html`<meta name="description" content="${DOCS_ABOUT}">
${pasted(around, 'How Weft works', DOCS_ABOUT)}`)
}

// What the site and the app keep about a person, in plain words. It says what is so, and has to
// be changed when what is kept changes.
export function privacyPage(around: Around): string {
    const main = html`<main class="wrap page mid">
    <div class="card note wide">
        <h1>Privacy</h1>
        <p>Making music in Weft needs no account and sends nothing about you anywhere. This page says what is kept when you do more than that.</p>
        <h2>An account</h2>
        <p>An account is only for publishing songs. Of an account the site keeps your email, the name you chose, and when it was made. Your password is not kept: only a scrambled form of it that cannot be turned back into the password. While you are signed in the site keeps a mark for that, and the app keeps its counterpart on your machine.</p>
        <p>Your email is shown to nobody. It is used to sign you in, and to send you a code when you have forgotten your password. That mail is sent through a mail service, which sees the address it sends to.</p>
        <h2>Songs you publish</h2>
        <p>A song you publish is public: its name, your name, what you wrote about it, the song itself with its sounds, and the half minute that can be listened to. The site counts how often a song is played and downloaded, as numbers only. Deleting a song takes it and its files off the site. Deleting your account, in the app under Your account, takes the account and every song of yours with it.</p>
        <h2>Jams</h2>
        <p>What two people do in a jam, the song, the chat and the sounds, passes through the relay to the other person and is not kept. Only the last changes to the song are held in its memory while the jam lasts, so that someone whose line drops can catch up; they are gone when the jam is over. If you switch Open to jam on, the name you typed, the tempo of your song and its number of patterns are shown to anyone until you switch it off or the jam begins. Voice and picture go straight from one machine to the other wherever the two networks let them. Where they do not, the server passes them on between the two, scrambled so that it cannot hear or see them, and keeps nothing. To find each other, each machine asks the server for the address it is reached at from outside; nothing of that is kept.</p>
        <h2>Reports</h2>
        <p>A report of a song is kept with the song and the time, and is mailed to whoever runs the site, through the same mail service. It carries no name.</p>
        <h2>What the server notes</h2>
        <p>Like every web server it notes each request: the address it came from, the time and what was asked for. Those notes are kept for two weeks and used only to keep the site running. The site sets no cookies and uses no tracking.</p>
        <h2>Where</h2>
        <p>All of it is on one server in Germany. A copy of the accounts and the published songs is made every night and kept for two weeks, so what you delete is gone from the copies two weeks later. ${around.source ? html`Questions can be asked where the <a href="${around.source}" rel="noopener">source code</a> is.` : ''}</p>
    </div>
</main>`
    return layout(around, 'privacy', 'Privacy, Weft', main)
}

// What stands over a list of songs: the names of its columns.
const COLUMNS = safe(`<div class="list-h" aria-hidden="true">
            <span></span>
            <span class="cap">Song</span>
            <span class="cap">Style</span>
            <span class="cap">Tempo</span>
            <span class="cap">Patterns</span>
            <span class="cap">Length</span>
            <span class="cap">Downloads</span>
            <span></span>
        </div>`)

function songsAddress(search: Search): string {
    const query = new URLSearchParams()
    if (search.q) query.set('q', search.q)
    if (search.sort !== 'newest') query.set('sort', search.sort)
    if (search.from !== null) query.set('from', String(search.from))
    if (search.to !== null) query.set('to', String(search.to))
    if (search.page > 1) query.set('page', String(search.page))
    const text = query.toString()
    return text ? `/songs?${text}` : '/songs'
}

export function songsPage(around: Around, search: Search, found: Found): string {
    const about = 'Listen to a preview, then download the song and open it in Weft.'
    const order = (sort: Search['sort'], label: string) => html`<a href="${songsAddress({ ...search, sort, page: 1 })}"${search.sort === sort ? safe(' aria-current="true"') : ''}>${label}</a>`
    const turn = (page: number, label: string) => html`<a class="btn sm" href="${songsAddress({ ...search, page })}">${label}</a>`
    const pages = html`<nav class="pages" aria-label="Pages">
        ${search.page > 1 ? turn(search.page - 1, 'Previous') : ''}
        <span class="mono">Page ${search.page} of ${found.pages}</span>
        ${search.page < found.pages ? turn(search.page + 1, 'Next') : ''}
    </nav>`
    const main = html`<main class="wrap page">
    <div class="ph">
        <div>
            <h1>Songs</h1>
            <p>${about}</p>
        </div>
    </div>

    <form class="tools" method="get" action="/songs">
        <label class="find">
            ${FIND}
            <input class="in" type="search" name="q" value="${search.q}" maxlength="60" placeholder="Search by name, maker or style" aria-label="Search songs">
        </label>
        ${search.sort === 'newest' ? '' : html`<input type="hidden" name="sort" value="${search.sort}">`}
        <div class="seg" role="group" aria-label="Order">
            ${order('newest', 'Newest')}
            ${order('downloads', 'Most downloaded')}
        </div>
        <div class="range">
            <span>Tempo</span>
            <input class="in" type="number" name="from" min="1" max="999" value="${search.from ?? ''}" placeholder="${found.slowest ?? ''}" aria-label="Slowest tempo, bpm">
            <span>to</span>
            <input class="in" type="number" name="to" min="1" max="999" value="${search.to ?? ''}" placeholder="${found.fastest ?? ''}" aria-label="Fastest tempo, bpm">
            <span>bpm</span>
        </div>
        <button class="btn" type="submit">Search</button>
        <span class="mono">${many(found.total, 'song')}</span>
    </form>

    <div class="card list">
        ${COLUMNS}
        ${found.songs.length ? html`<ul>
            ${found.songs.map((song) => row(song))}
        </ul>` : html`<p class="none">${found.total ? 'There is no such page.' : search.q || search.from !== null || search.to !== null ? 'No song matches that.' : 'Nothing is published yet.'}</p>`}
    </div>
    ${found.pages > 1 ? pages : ''}
    <p class="tail">A style is whatever its maker typed. Press one to see the songs that share it.</p>
</main>`
    return layout(around, 'songs', 'Songs, Weft', main, '', pasted(around, 'Songs made in Weft', about))
}

// The songs of one person that are shown, newest first. There is always at least one: the site
// has no such page for someone with nothing to show.
export function makerPage(around: Around, who: Maker, songs: Listed[]): string {
    const about = `${many(songs.length, 'song')} made in Weft.`
    const main = html`<main class="wrap page">
    <div class="ph">
        <div>
            <nav class="crumb" aria-label="You are here">
                <a href="/songs">Songs</a>
                <span aria-hidden="true">/</span>
                <span>${who.name}</span>
            </nav>
            <h1>${who.name}</h1>
            <p>${about}</p>
        </div>
    </div>
    <div class="card list">
        ${COLUMNS}
        <ul>
            ${songs.map((song) => row(song))}
        </ul>
    </div>
</main>`
    return layout(around, 'maker', `Songs by ${who.name}, Weft`, main, '', pasted(around, `Songs by ${who.name}`, about))
}

function player(song: Shown): Markup {
    const seconds = song.preview.seconds
    const from = `from bar ${song.previewFrom + 1}`
    return html`<div class="card player"${holds(song)}>
                <div class="player-h">
                    <span class="cap">Preview</span>
                    <span>${seconds ? `${ofSeconds(seconds)}, ${from}` : `It starts ${from}`}</span>
                </div>
                ${playLink(song)}
                <div class="wave" role="img" aria-label="The sound of the preview">
                    ${waveUse('w-preview', 150, 'w-l')}
                    ${waveUse('w-preview-s', 64, 'w-s')}
                    <div class="wave-p">${waveUse('w-preview', 150, 'w-l')}${waveUse('w-preview-s', 64, 'w-s')}</div>
                </div>
                <div class="player-f">
                    <span class="num" data-now>0:00</span>
                    <span class="num">${seconds ? clock(seconds) : ''}</span>
                </div>
            </div>`
}

// The form behind the Report link. It opens without a script, and anyone may send it.
function report(song: Shown): Markup {
    return html`<details class="rep">
                <summary>${FLAG}<span><u>Report this song</u> for someone else's samples, or abuse.</span></summary>
                <form method="post" action="/songs/${song.id}/report">
                    <textarea class="in" name="reason" rows="3" maxlength="${REASON_LIMIT}" required aria-label="What is wrong with this song"></textarea>
                    <button class="btn sm" type="submit">Send the report</button>
                </form>
            </details>`
}

export function songPage(around: Around, song: Shown, more: Listed[]): string {
    const by = song.by.name
    const address = around.origin ? `${around.origin}/songs/${song.id}` : ''
    const whose = [`By ${by}`, song.style, song.tempo ? bpm(song.tempo) : ''].filter(Boolean).join(', ')
    const about = [whose.endsWith('.') ? whose : `${whose}.`, startOf(song.description, 160)].filter(Boolean).join(' ')
    // The size of the picture has to stand right after where the picture is, which is said last.
    const head = html`<meta property="og:type" content="music.song">
${pasted(around, song.name, about, `/songs/${song.id}.png`)}${address ? html`<meta property="og:image:width" content="${PICTURE.width}">
<meta property="og:image:height" content="${PICTURE.height}">
<meta property="og:url" content="${address}">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${address}">
` : ''}`
    const ownBytes = song.sounds.reduce((sum, sound) => sum + sound.bytes, 0)
    const length = song.bars === null ? '' : `${many(song.bars, 'bar')}${song.length ? `, ${lasting(song.length)}` : ''}`
    const defs = defsOf([waveDef('w-preview', song.preview.peaks, 150), waveDef('w-preview-s', song.preview.peaks, 64)])
    const users = (sound: OwnSound) => sound.usedBy.map((at, nth) => html`<i class="dot ${hue(at)}"></i> ${nth ? 'and' : 'used by'} <b>${song.parts[at].name}</b> `)
    const patterns = html`<section class="part" aria-labelledby="h-pats">
                <div class="part-h">
                    <h2 id="h-pats">Patterns</h2>
                    <span class="num">${song.patterns}</span>
                </div>
                <ul class="pats">
                    ${song.parts.map((part, at) => html`<li${part.own ? safe(' class="own"') : ''}><i class="dot ${hue(at)}"></i><b>${part.name}</b><code>${part.sound}</code></li>`)}
                </ul>
            </section>`
    const sounds = html`<section class="part" aria-labelledby="h-snds">
                <div class="part-h">
                    <h2 id="h-snds">Sounds of ${by}'s own</h2>
                    <span class="num">${song.sounds.length}</span>
                </div>
                <p>They are inside the file, so the song plays for you as it does for ${by}.</p>
                <ul class="card snds">
                    ${song.sounds.map((sound) => html`<li>
                        <span class="snd-i" aria-hidden="true">${SOUND}</span>
                        <div>
                            <code>${sound.name}</code>
                            <p>${sound.kind}, ${ofSeconds(sound.seconds)} ${users(sound)}</p>
                        </div>
                        <span class="num">${size(sound.bytes, 2)}</span>
                    </li>`)}
                </ul>
            </section>`
    const from = song.from === 'gone' ? 'Made from a song that is no longer on the site' : song.from ? html`Made from <a href="/songs/${song.from.id}"><b>${song.from.name}</b></a> by ${nameLink(song.from.by)}` : ''
    const made = html`<section class="part" aria-labelledby="h-made">
                <div class="part-h">
                    <h2 id="h-made">Made from this</h2>
                </div>
                <ul class="made">
                    ${song.made.map((one) => html`<li><a href="/songs/${one.id}">${one.name}</a><span class="by">${disc(one.by, true)}${nameLink(one.by)}</span></li>`)}
                </ul>
            </section>`
    const main = html`<main class="wrap page">
    <article class="song">
        <div class="song-a">
            <nav class="crumb" aria-label="You are here">
                <a href="/songs">Songs</a>
                <span aria-hidden="true">/</span>
                <span>${song.name}</span>
            </nav>
            <h1>${song.name}</h1>
            <div class="meta">
                <span class="by">${disc(song.by)}${nameLink(song.by)}</span>
                ${song.style ? html`<a class="chip" href="/songs?q=${encodeURIComponent(song.style)}" title="Songs tagged ${song.style}">${song.style}</a>` : ''}
                <span>Published ${day(song.published)}</span>
            </div>

            ${player(song)}

            ${song.description ? html`<p class="about">${song.description}</p>` : ''}
            ${from ? html`<p class="from">${TURN}<span>${from}</span></p>` : ''}
        </div>

        <aside class="get" aria-label="Get this song">
            <div class="card">
                <div class="get-a">
                    <a class="btn go" href="/songs/${song.id}.weft">${DOWN}Download .weft</a>
                    <a class="btn" href="weft://song/${song.id}">${OUT}Open in Weft</a>
                    <p class="quiet needs">Needs the Weft app on this machine.</p>
                    <p class="mono">${song.fileName}, ${size(song.bytes)}</p>
                </div>
                <dl class="facts">
                    ${song.tempo ? html`<div><dt>Tempo</dt><dd>${bpm(song.tempo)}</dd></div>` : ''}
                    ${length ? html`<div><dt>Length</dt><dd>${length}</dd></div>` : ''}
                    <div><dt>Patterns</dt><dd>${song.patterns}</dd></div>
                    ${song.sounds.length ? html`<div><dt>Sounds of ${by}'s own</dt><dd>${song.sounds.length}, ${size(ownBytes, 2)}</dd></div>` : ''}
                    <div><dt>File size</dt><dd>${size(song.bytes)}</dd></div>
                    <div><dt>Plays of the preview</dt><dd>${song.plays}</dd></div>
                    <div><dt>Downloads</dt><dd>${song.downloads}</dd></div>
                </dl>
                <div class="lic">
                    <span class="cap">Licence</span>
                    <b>${song.licence}</b>
                    <p>${LICENCE_WORDS[song.licence]?.(by) ?? ''}</p>
                </div>
            </div>
            ${report(song)}
        </aside>

        <div class="song-b">
            ${song.parts.length ? patterns : ''}
            ${song.sounds.length ? sounds : ''}
            ${song.made.length ? made : ''}
        </div>
    </article>

    ${more.length ? html`<section class="more" aria-labelledby="h-more">
        <div class="part-h">
            <h2 id="h-more">More by ${by}</h2>
        </div>
        <ul class="card list">
            ${more.map((other) => row(other, true))}
        </ul>
    </section>` : ''}
</main>`
    return layout(around, 'song', `${song.name} by ${by}, Weft`, main, defs, head)
}

// A small page with one thing on it: a refusal, what happened, or what is not there.
export function notePage(around: Around, title: string, heading: string, lines: string[], go?: { href: string; label: string }): string {
    const main = html`<main class="wrap page mid">
    <div class="card note">
        <h1>${heading}</h1>
        ${lines.map((line) => html`<p>${line}</p>`)}
        ${go ? html`<a class="btn" href="${go.href}">${go.label}</a>` : ''}
    </div>
</main>`
    return layout(around, 'note', title, main)
}
