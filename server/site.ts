import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkSongFile, looksLikeAudio } from '../src/guard/file'
import { SONG_LIMIT, soundsUsed } from '../src/library/songfile'
import { analyze } from '../src/song/analyze'
import { DEFAULT_SONG, songLength } from '../src/song/arrange'
import { downloadPage, homePage, licencePage, notePage, privacyPage, REASON_LIMIT, songPage, songsPage, type Around, type Build, type Found, type Listed, type Maker, type OwnSound, type Part, type Platform, type Search, type Shown } from './pages'
import { songPicture } from './picture'
import { senderOf } from './sender'

// The site that songs are published to. It has two sides. The pages are for everyone and know
// nobody: the songs, each song's own page, the downloads of the app. The API is for the app,
// which is where a person has an account, signs in and looks after their songs. Every file
// that arrives is checked here, whoever sends it: a song file can be made by hand, so what the
// app checked counts for nothing. What the pages look like is in pages.ts.
export type SiteOptions = {
    port: number
    host?: string
    dataDir: string
    // The address people reach the site at, for the links it hands out.
    origin?: string
    // Sends the code for choosing a new password. Without one a forgotten password cannot be
    // replaced, unless `codesShown` says that the code may be handed straight back to whoever
    // asked. That is only for trying the site out on one's own machine: anywhere else it would
    // give every account to anyone who knows its email.
    mail?: (to: string, code: string) => void | Promise<void>
    codesShown?: boolean
    // True where a web server stands in front and notes who each request comes from.
    behindProxy?: boolean
    // What a call between two machines needs to find its way: who tells a machine its address
    // from outside (`stun`), and who carries the call for the pairs that cannot reach each
    // other directly (`turn`). The second costs traffic, so it is only used by whoever was
    // handed a pass, which is made here from a secret the carrier shares and runs out.
    ice?: { stun?: string[]; turn?: { urls: string[]; secret: string; hours?: number } }
    // Told of every report of a song as it is kept, so that somebody reads it.
    reported?: (report: { id: string; name: string; reason: string }) => void | Promise<void>
    allow?: string[]
    now?: () => number
    // Where the app's source code can be read. The pages leave that link out until there is
    // such a place.
    source?: string
    // The installers that are built. A platform without one is said to be not out yet.
    downloads?: { platform: Platform; file: string; version: string }[]
    // A folder that releases of the app are put into. `downloads.json` in it lists the installers,
    // as { builds: [{ platform, file, version }] } with file names in the folder, and `latest.json`
    // is what an installed app reads to learn of a newer version. Both are read anew when they
    // change, so a release needs no restart.
    releases?: string
    // How often one sender, or one email, may ask for an account, a sign-in or a code within a
    // quarter of an hour. Only raised where the site is tried out on one's own machine.
    asks?: number
}
export type Site = { port: number; origin: string; close: () => Promise<void> }

export const MOST_SONGS = 10
export const LICENCES = ['CC BY 4.0', 'CC BY-SA 4.0', 'CC0'] as const
type Licence = (typeof LICENCES)[number]

const PREVIEW_LIMIT = 700 * 1024
const BODY_LIMIT = 3 * 1024 * 1024
const SESSION_FOR = 90 * 24 * 60 * 60 * 1000
const ASKS = 10
// How often one sender is handed a pass for the carrier of calls in that time: once a jam.
const ICE_ASKS = 40
const ASKS_WITHIN = 15 * 60 * 1000
const DESCRIPTION_LIMIT = 500
const STYLE_LIMIT = 30
const NAME_LIMIT = 24
const MOST_PEAKS = 200
const MOST_SECONDS = 31
const MOST_REPORTS = 5000
const A_PAGE = 24
const APP_ORIGINS = ['http://localhost:5180', 'tauri://localhost', 'https://tauri.localhost', 'http://tauri.localhost']
const PLATFORM_NAMES: Record<Platform, string> = { macos: 'macOS', windows: 'Windows', linux: 'Linux' }
// A page may load only what this site serves itself, and may run nothing written into it.
const PAGE_RULES = "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; media-src 'self'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
const KEPT_AN_HOUR = 'public, max-age=3600'
const KEPT_A_MONTH = 'public, max-age=2592000'

const PASSWORD_LEAST = 8
const PASSWORD_MOST = 200
// What a password is made into before it is kept. The numbers are kept with it, so they can be
// raised one day and a password made with the old ones still be checked.
const SCRYPT = { N: 32768, r: 8, p: 1 }
const SALT_BYTES = 16
const KEY_BYTES = 32
// The code for choosing a new password: letters and digits that are not mistaken for each
// other, typed into the app by whoever got it.
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8
const CODE_FOR = 15 * 60 * 1000
const CODE_TRIES = 5
const WRONG = 'The email or the password is not right.'
const WAIT = 'Too many tries. Wait a quarter of an hour and try again.'
const NOT_AN_ADDRESS = 'That is not an email address.'

// `password` is what scrypt made of it, never the password. An account from before there were
// passwords has none, and gets one with a code, as for a forgotten one.
type Person = { id: string; email: string; name: string; since: number; password?: string }
type Session = { hash: string; person: string; until: number }
type Song = {
    id: string
    by: string
    name: string
    description: string
    style: string
    licence: Licence
    previewFrom: number
    bytes: number
    tempo: number | null
    patterns: string[]
    published: number
    hidden: boolean
    plays: number
    downloads: number
    // How loud the preview is along its length, and how long it is, for the pages to draw.
    peaks?: number[]
    seconds?: number
    // The published song this one was reworked from.
    from?: string
}
type Report = { song: string; reason: string; at: number }
type Kept = { people: Person[]; sessions: Session[]; songs: Song[]; reports: Report[] }
type Code = { hash: string; until: number; wrong: number }
type Kind = { bytes: Buffer; type: string; kept: string }
type Answer = { status: number; body?: unknown; html?: string; file?: { bytes: Buffer; type: string; name?: string }; fixed?: Kind; build?: { file: string; bytes: number } }
// What a song file says about its song once it is read.
type Facts = { bars: number; parts: Part[]; sounds: OwnSound[] }

const hashOf = (text: string) => createHash('sha256').update(text).digest('hex')
const token = (bytes = 32) => randomBytes(bytes).toString('base64url')
const shortId = () => randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').toLowerCase()
const clean = (value: unknown, most: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, most)
const emailOf = (value: unknown): string | null => {
    const email = String(value ?? '').trim().toLowerCase()
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}
const sameText = (one: string, other: string) => one.length === other.length && timingSafeEqual(Buffer.from(one), Buffer.from(other))
const fileNameOf = (name: string) => name.replace(/[^\w .-]+/g, '_')
const newestFirst = (a: Song, b: Song) => b.published - a.published
// Which of the six colours stands for a person, always the same one.
const tintOf = (id: string) => [...id].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 6
const newCode = () => Array.from({ length: CODE_LENGTH }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]).join('')
// A code as it was typed: in either case, with whatever was put between its letters.
const codeOf = (value: unknown) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH + 1)

// How many characters a password has, as a person counts them. Text far past the most a
// password may be is not counted out.
const lettersOf = (value: unknown): number => (typeof value !== 'string' ? 0 : value.length > 2 * PASSWORD_MOST ? Infinity : [...value].length)
const passwordRefused = (value: unknown): string | null => {
    const letters = lettersOf(value)
    if (letters < PASSWORD_LEAST) return `A password needs at least ${PASSWORD_LEAST} characters.`
    return letters > PASSWORD_MOST ? `A password can have ${PASSWORD_MOST} characters at most.` : null
}

const derived = (password: string, salt: Buffer, cost: { N: number; r: number; p: number }, bytes: number): Promise<Buffer> =>
    new Promise((resolve, reject) => scrypt(password.normalize('NFKC'), salt, bytes, { ...cost, maxmem: 256 * cost.N * cost.r }, (err, key) => (err ? reject(err) : resolve(key))))

async function hashed(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES)
    const key = await derived(password, salt, SCRYPT, KEY_BYTES)
    return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), key.toString('base64url')].join('$')
}

async function matches(password: string, stored: string): Promise<boolean> {
    const [kind, N, r, p, salt, key] = stored.split('$')
    if (kind !== 'scrypt' || !salt || !key) return false
    const wanted = Buffer.from(key, 'base64url')
    try {
        const made = await derived(password, Buffer.from(salt, 'base64url'), { N: Number(N), r: Number(r), p: Number(p) }, wanted.length)
        return made.length === wanted.length && timingSafeEqual(made, wanted)
    } catch {
        return false
    }
}
// What a password is checked against when there is no such account, so that the answer takes
// as long as it does when there is one and the time does not tell which it was.
const NOBODY = ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, Buffer.alloc(SALT_BYTES).toString('base64url'), Buffer.alloc(KEY_BYTES).toString('base64url')].join('$')

const peaksOf = (value: unknown): number[] | undefined =>
    Array.isArray(value) && value.length > 0 && value.length <= MOST_PEAKS && value.every((peak) => typeof peak === 'number' && peak >= 0 && peak <= 1) ? value.map((peak: number) => Math.round(peak * 100) / 100) : undefined
const secondsOf = (value: unknown): number | undefined => (typeof value === 'number' && value > 0 && value <= MOST_SECONDS ? Math.round(value * 10) / 10 : undefined)

const KINDS: Record<string, string> = { mpeg: 'MP3', mp3: 'MP3', wav: 'WAV', wave: 'WAV', 'x-wav': 'WAV', ogg: 'Ogg', flac: 'FLAC', 'x-flac': 'FLAC', aiff: 'AIFF', aif: 'AIFF', 'x-aiff': 'AIFF', mp4: 'MP4', m4a: 'MP4', 'x-m4a': 'MP4', aac: 'AAC', webm: 'WebM' }
const kindOf = (type: string, file: string) => KINDS[type.replace(/^audio\//, '').toLowerCase()] ?? KINDS[/\.([a-z0-9]+)$/i.exec(file)?.[1]?.toLowerCase() ?? ''] ?? 'Audio'

// A song file that passed the check, read for what its page tells: the patterns with the sound
// each plays, the maker's own sounds with the patterns that use them, and the bars it lasts.
function readFacts(text: string): Facts | null {
    try {
        const file = JSON.parse(text) as { code: string; sounds: { name: string; file: string; type: string; seconds: number; data: string }[] }
        const read = analyze(file.code)
        const names = file.sounds.map((sound) => sound.name)
        const blocks = read.patterns.slice(0, 64)
        const used = blocks.map((block) => soundsUsed(file.code.slice(block.from, block.to), names))
        return {
            bars: songLength(read.patterns, DEFAULT_SONG),
            parts: blocks.map((block, at) => ({ name: block.id, sound: block.soundName ?? used[at][0] ?? '', own: used[at].length > 0 })),
            sounds: file.sounds.map((sound) => ({
                name: sound.name,
                kind: kindOf(sound.type, sound.file),
                seconds: sound.seconds,
                bytes: Math.floor((sound.data.length * 3) / 4),
                usedBy: used.flatMap((own, at) => (own.includes(sound.name) ? [at] : [])),
            })),
        }
    } catch {
        return null
    }
}

const HERE = dirname(fileURLToPath(import.meta.url))
const SETS = ['cyrillic-ext', 'cyrillic', 'greek-ext', 'greek', 'vietnamese', 'latin-ext', 'latin']
// The font files the pages use, by the package each comes in. Nothing else is served from
// those packages, and no name is ever taken from a request.
const FONTS: Record<string, string[]> = {
    archivo: ['vietnamese', 'latin-ext', 'latin'].map((set) => `archivo-${set}-wdth-normal.woff2`),
    'martian-mono': ['cyrillic-ext', 'cyrillic', 'latin-ext', 'latin'].map((set) => `martian-mono-${set}-wdth-normal.woff2`),
    piazzolla: SETS.flatMap((set) => [`piazzolla-${set}-opsz-normal.woff2`, `piazzolla-${set}-opsz-italic.woff2`]),
}

// Where a package of this project lies: in the nearest node_modules above this file that has it.
function packageDir(name: string): string | null {
    for (let dir = HERE; ; dir = dirname(dir)) {
        const there = join(dir, 'node_modules', name)
        if (existsSync(there)) return there
        if (dirname(dir) === dir) return null
    }
}

// Everything the site serves that is the same for everyone, read once, by the address it is
// served at. A font that is not there is left out, and the pages fall back to the system's.
function fixedFiles(): Map<string, Kind> {
    const files = new Map<string, Kind>()
    const own = (path: string, type: string) => files.set(path, { bytes: readFileSync(join(HERE, 'assets', path.slice(1))), type, kept: KEPT_AN_HOUR })
    own('/site.css', 'text/css; charset=utf-8')
    own('/site.js', 'text/javascript; charset=utf-8')
    for (const picture of ['/app-1.png', '/app-2.png', '/app-3.png']) own(picture, 'image/png')
    own('/icon.svg', 'image/svg+xml')
    for (const [family, names] of Object.entries(FONTS)) {
        const dir = packageDir(`@fontsource-variable/${family}`)
        for (const name of names) {
            // Where the site runs away from the project, the fonts lie beside its other files.
            const beside = join(HERE, 'assets', 'fonts', name)
            const file = existsSync(beside) ? beside : dir ? join(dir, 'files', name) : ''
            if (file && existsSync(file)) files.set(`/fonts/${name}`, { bytes: readFileSync(file), type: 'font/woff2', kept: KEPT_A_MONTH })
        }
    }
    return files
}

export function createSite(options: SiteOptions): Promise<Site> {
    const now = options.now ?? Date.now
    const songsDir = join(options.dataDir, 'songs')
    const keptFile = join(options.dataDir, 'site.json')
    mkdirSync(songsDir, { recursive: true })
    let kept: Kept = { people: [], sessions: [], songs: [], reports: [] }
    if (existsSync(keptFile)) {
        try {
            kept = { ...kept, ...(JSON.parse(readFileSync(keptFile, 'utf8')) as Partial<Kept>) }
        } catch {
            throw new Error(`${keptFile} cannot be read. It is left as it is; move it away to start afresh.`)
        }
    }
    // What is kept holds emails, so it is for the site's own user to read and nobody else.
    const keep = () => {
        writeFileSync(`${keptFile}.new`, JSON.stringify(kept), { mode: 0o600 })
        renameSync(`${keptFile}.new`, keptFile)
    }
    const fixed = fixedFiles()
    // An address is only written into a page when it begins the way a web address does.
    const webAddress = (given: string | undefined) => (/^https?:\/\//.test(given ?? '') ? given : undefined)
    const around: Around = { source: webAddress(options.source), origin: webAddress(options.origin) }
    type Installer = { file: string; version: string; bytes: number }
    const installers = (list: { platform: Platform; file: string; version: string }[]) => {
        const there = new Map<Platform, Installer>()
        for (const build of list) {
            if (Object.hasOwn(PLATFORM_NAMES, build.platform) && existsSync(build.file) && statSync(build.file).isFile()) there.set(build.platform, { file: build.file, version: clean(build.version, 40), bytes: statSync(build.file).size })
        }
        return there
    }
    // A file of a release, by its name alone: nothing above the folder, nothing hidden.
    const released = (name: unknown): string | null => {
        if (!options.releases || typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._ ()-]{0,120}$/.test(name)) return null
        const file = join(options.releases, name)
        return existsSync(file) && statSync(file).isFile() ? file : null
    }
    let builds = installers(options.downloads ?? [])
    let listedAt = -1
    const buildsNow = () => {
        const list = released('downloads.json')
        const at = list ? statSync(list).mtimeMs : 0
        if (at === listedAt) return builds
        listedAt = at
        let said: { platform: Platform; file: string; version: string }[] = []
        try {
            const read = list ? (JSON.parse(readFileSync(list, 'utf8')) as { builds?: unknown }).builds : []
            if (Array.isArray(read)) said = read.flatMap((one) => (released(one?.file) ? [{ platform: one.platform, file: released(one.file)!, version: String(one.version ?? '') }] : []))
        } catch {
            said = []
        }
        builds = new Map([...installers(options.downloads ?? []), ...installers(said)])
        return builds
    }
    const built = (): Build[] => [...buildsNow()].map(([platform, build]) => ({ platform, version: build.version, bytes: build.bytes }))
    // The codes for choosing a new password that are out, by the address each was sent to.
    const codes = new Map<string, Code>()
    const asked = new Map<string, number[]>()
    const facts = new Map<string, Facts | null>()
    const pictures = new Map<string, Buffer>()
    const allowed = new Set(options.allow ?? APP_ORIGINS)
    let origin = options.origin ?? ''

    const tooMany = (who: string, most = options.asks ?? ASKS): boolean => {
        const since = now() - ASKS_WITHIN
        const times = (asked.get(who) ?? []).filter((at) => at > since)
        times.push(now())
        asked.set(who, times)
        return times.length > most
    }

    const bearerOf = (request: IncomingMessage) => /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1]
    const personOf = (request: IncomingMessage): Person | null => {
        const given = bearerOf(request)
        if (!given) return null
        const session = kept.sessions.find((one) => one.hash === hashOf(given) && one.until > now())
        return session ? (kept.people.find((person) => person.id === session.person) ?? null) : null
    }
    // A browser says where a request that changes something comes from, and one that comes
    // from another site is not taken. The pages ask browsers to send no referrer, and a
    // browser then gives the origin of this site's own forms as "null" too, so that word
    // settles nothing: what the browser says of the two sites does, where it says it.
    const fromElsewhere = (request: IncomingMessage): boolean => {
        const sites = request.headers['sec-fetch-site']
        if (sites) return sites !== 'same-origin' && sites !== 'none'
        const said = request.headers.origin
        if (!said || said === 'null' || said === origin) return false
        try {
            return new URL(said).host !== request.headers.host
        } catch {
            return true
        }
    }

    const mine = (person: Person) => kept.songs.filter((song) => song.by === person.id)
    const nameOf = (id: string) => kept.people.find((person) => person.id === id)?.name ?? 'Someone'
    const makerOf = (id: string): Maker => ({ name: nameOf(id), tint: tintOf(id) })
    const shown = (song: Song) => ({ ...song, by: nameOf(song.by), url: `${origin}/songs/${song.id}`, file: `${origin}/songs/${song.id}.weft`, preview: `${origin}/songs/${song.id}.mp3` })
    const meOf = (person: Person): Answer => ({ status: 200, body: { name: person.name, email: person.email, used: mine(person).length, most: MOST_SONGS } })
    const refuse = (status: number, why: string, what: string, more: object = {}): Answer => ({ status, body: { why, what, ...more } })
    const signIn: Answer = refuse(401, 'signin', 'Sign in first.')

    // What the file of a song says, read the first time a page needs it and kept from then on:
    // a published file never changes.
    const factsOf = (song: Song): Facts | null => {
        if (!facts.has(song.id)) {
            const stored = join(songsDir, `${song.id}.weft`)
            facts.set(song.id, existsSync(stored) ? readFacts(readFileSync(stored, 'utf8')) : null)
        }
        return facts.get(song.id) ?? null
    }
    // The picture a song is shown with wherever its address is pasted, drawn the first time it
    // is asked for and kept until the song is hidden or deleted.
    const pictureOf = (song: Song): Buffer => {
        const drawn = pictures.get(song.id) ?? songPicture(song.peaks ?? [])
        pictures.set(song.id, drawn)
        return drawn
    }
    const listed = (song: Song): Listed => {
        const read = factsOf(song)
        return {
            id: song.id,
            name: song.name,
            by: makerOf(song.by),
            style: song.style,
            tempo: song.tempo,
            patterns: song.patterns.length,
            length: read && song.tempo ? (read.bars * 240) / Math.max(1, song.tempo) : null,
            bytes: song.bytes,
            published: song.published,
            plays: song.plays,
            downloads: song.downloads,
            preview: { seconds: song.seconds ?? null, peaks: song.peaks ?? [] },
        }
    }
    // A song as its own page shows it. What it was reworked from is only named while that song
    // is there to be opened, so the line never leads nowhere.
    const shownOnPage = (song: Song): Shown => {
        const read = factsOf(song)
        const from = kept.songs.find((one) => one.id === song.from && !one.hidden)
        return {
            ...listed(song),
            description: song.description,
            licence: song.licence,
            previewFrom: song.previewFrom,
            bars: read?.bars ?? null,
            parts: read?.parts ?? song.patterns.map((name) => ({ name, sound: '', own: false })),
            sounds: read?.sounds ?? [],
            fileName: `${fileNameOf(song.name)}.weft`,
            origin: from ? { id: from.id, name: from.name, by: nameOf(from.by) } : null,
        }
    }

    function searchOf(url: URL): Search {
        const tempo = (name: string) => {
            const given = Math.floor(Number(url.searchParams.get(name)))
            return url.searchParams.get(name) && given >= 1 && given <= 999 ? given : null
        }
        const page = Math.floor(Number(url.searchParams.get('page')))
        return { q: clean(url.searchParams.get('q'), 60), sort: url.searchParams.get('sort') === 'downloads' ? 'downloads' : 'newest', from: tempo('from'), to: tempo('to'), page: page >= 1 && page <= 100000 ? page : 1 }
    }

    function found(search: Search): Found {
        const out = kept.songs.filter((song) => !song.hidden)
        const tempos = out.flatMap((song) => (song.tempo ? [Math.round(song.tempo)] : []))
        const q = search.q.toLowerCase()
        const within = (song: Song) => {
            if (search.from === null && search.to === null) return true
            if (!song.tempo) return false
            return Math.round(song.tempo) >= (search.from ?? 0) && Math.round(song.tempo) <= (search.to ?? Infinity)
        }
        const matching = out.filter((song) => within(song) && (!q || [song.name, song.style, nameOf(song.by)].some((text) => text.toLowerCase().includes(q))))
        matching.sort(search.sort === 'downloads' ? (a, b) => b.downloads - a.downloads || newestFirst(a, b) : newestFirst)
        return {
            songs: matching.slice((search.page - 1) * A_PAGE, search.page * A_PAGE).map(listed),
            total: matching.length,
            pages: Math.max(1, Math.ceil(matching.length / A_PAGE)),
            slowest: tempos.length ? tempos.reduce((low, tempo) => Math.min(low, tempo)) : null,
            fastest: tempos.length ? tempos.reduce((high, tempo) => Math.max(high, tempo)) : null,
        }
    }

    function removeSong(song: Song) {
        kept.songs = kept.songs.filter((one) => one !== song)
        facts.delete(song.id)
        pictures.delete(song.id)
        for (const ending of ['weft', 'mp3']) rmSync(join(songsDir, `${song.id}.${ending}`), { force: true })
    }

    // A new session for a person, for the app to hold from now on.
    function sessionFor(person: Person): string {
        const session = token()
        kept.sessions = kept.sessions.filter((one) => one.until > now())
        kept.sessions.push({ hash: hashOf(session), person: person.id, until: now() + SESSION_FOR })
        keep()
        return session
    }

    // Null when this can be the name that stands beside a person's songs.
    const nameRefused = (name: string): Answer | null => {
        if (!name) return refuse(400, 'name', 'Type the name that should stand beside your songs.')
        return name.length > NAME_LIMIT ? refuse(400, 'name', `A name can have ${NAME_LIMIT} characters at most.`) : null
    }

    async function registered(body: any, from: string): Promise<Answer> {
        const email = emailOf(body?.email)
        if (!email) return refuse(400, 'email', NOT_AN_ADDRESS)
        const weak = passwordRefused(body?.password)
        if (weak) return refuse(400, 'password', weak)
        const name = clean(body?.name, NAME_LIMIT + 1)
        const unnamed = nameRefused(name)
        if (unnamed) return unnamed
        if (tooMany(`join from ${from}`)) return refuse(429, 'wait', WAIT)
        const taken = () => kept.people.some((one) => one.email === email)
        const password = taken() ? '' : await hashed(body.password)
        // Looked at again once the password is made: someone else may have taken the address
        // in the time that took.
        if (taken()) return refuse(409, 'taken', 'There is already an account with this email. Sign in instead.')
        let id = shortId()
        while (kept.people.some((one) => one.id === id)) id = shortId()
        const person: Person = { id, email, name, since: now(), password }
        kept.people.push(person)
        return { status: 201, body: { token: sessionFor(person), name, email } }
    }

    // The person an address and a password belong to, or null when the two are not right
    // together. Which of them was wrong is never said, and one scrypt is run whichever it was.
    async function holderBy(givenEmail: unknown, givenPassword: unknown): Promise<Person | null> {
        const email = emailOf(givenEmail)
        const typed = typeof givenPassword === 'string' && lettersOf(givenPassword) <= PASSWORD_MOST ? givenPassword : ''
        const person = email ? kept.people.find((one) => one.email === email) : undefined
        const right = await matches(typed, person?.password ?? NOBODY)
        return person?.password && typed && right ? person : null
    }

    async function signedIn(body: any, from: string): Promise<Answer> {
        if (tooMany(`try from ${from}`) || tooMany(`try as ${emailOf(body?.email) ?? ''}`)) return refuse(429, 'wait', WAIT)
        const person = await holderBy(body?.email, body?.password)
        if (!person) return refuse(401, 'wrong', WRONG)
        return { status: 200, body: { token: sessionFor(person), name: person.name, email: person.email } }
    }

    // A new password in place of the one a person has. The session it was asked from stays;
    // every other one of that person ends, so whoever else held the old password is out.
    async function passwordChanged(person: Person, session: string, body: any): Promise<Answer> {
        const weak = passwordRefused(body?.new)
        if (weak) return refuse(400, 'password', weak)
        if (tooMany(`old of ${person.id}`)) return refuse(429, 'wait', WAIT)
        if (!(await holderBy(person.email, body?.old))) return refuse(401, 'wrong', 'The password you have now is not right.')
        person.password = await hashed(body.new)
        kept.sessions = kept.sessions.filter((one) => one.person !== person.id || one.hash === hashOf(session))
        keep()
        return { status: 200, body: {} }
    }

    // The code is sent and nothing is said of how that went: the answer is the same whether or
    // not there is such an account, and must not differ by whether a mail could be sent.
    function mailed(to: string, code: string) {
        try {
            void Promise.resolve(options.mail?.(to, code)).catch(() => undefined)
        } catch {
            return
        }
    }

    // Asked by the app when a jam begins. A pass for the carrier is good for half a day, which
    // is longer than a jam, and is of no use after that.
    function iceFor(from: string): Answer {
        const given = options.ice ?? {}
        const servers: { urls: string[]; username?: string; credential?: string }[] = []
        if (given.stun?.length) servers.push({ urls: given.stun })
        if (given.turn?.urls.length && given.turn.secret) {
            if (tooMany(`ice from ${from}`, ICE_ASKS)) return refuse(429, 'wait', WAIT)
            const username = `${Math.floor(now() / 1000) + (given.turn.hours ?? 12) * 3600}:${token(6)}`
            servers.push({ urls: given.turn.urls, username, credential: createHmac('sha1', given.turn.secret).update(username).digest('base64') })
        }
        return { status: 200, body: { iceServers: servers } }
    }

    // A code to choose a new password with, for the account with this address when there is
    // one. The code is only handed back by a site that sends no mail.
    function forgotten(body: any, from: string): Answer {
        const email = emailOf(body?.email)
        if (!email) return refuse(400, 'email', NOT_AN_ADDRESS)
        if (!options.mail && !options.codesShown) return refuse(503, 'mail', 'This site cannot send mail yet, so it cannot send a code for a new password. Sign in with the password you have.')
        if (tooMany(`forgot from ${from}`) || tooMany(`forgot as ${email}`)) return refuse(429, 'wait', 'Too many codes were asked for. Wait a quarter of an hour and ask again.')
        for (const [to, one] of codes) if (one.until <= now()) codes.delete(to)
        if (!kept.people.some((one) => one.email === email)) return { status: 200, body: {} }
        const code = newCode()
        codes.set(email, { hash: hashOf(`${email} ${code}`), until: now() + CODE_FOR, wrong: 0 })
        if (!options.mail) return { status: 200, body: { code } }
        mailed(email, code)
        return { status: 200, body: {} }
    }

    // A new password for whoever types the code that was sent to their address. A code works
    // once and not for long, and a few wrong tries are the end of it, so it cannot be guessed.
    async function passwordReset(body: any, from: string): Promise<Answer> {
        const weak = passwordRefused(body?.password)
        if (weak) return refuse(400, 'password', weak)
        const email = emailOf(body?.email)
        if (tooMany(`reset from ${from}`) || tooMany(`reset as ${email ?? ''}`)) return refuse(429, 'wait', WAIT)
        const sent = email ? codes.get(email) : undefined
        const person = email ? kept.people.find((one) => one.email === email) : undefined
        const right = Boolean(sent && sent.until > now() && sameText(sent.hash, hashOf(`${email} ${codeOf(body?.code)}`)))
        if (!email || !sent || !person || !right) {
            if (email && sent && (sent.until <= now() || ++sent.wrong >= CODE_TRIES)) codes.delete(email)
            return refuse(400, 'code', 'That code is not right, or it has run out. Ask for a new one.')
        }
        codes.delete(email)
        person.password = await hashed(body.password)
        kept.sessions = kept.sessions.filter((one) => one.person !== person.id)
        return { status: 200, body: { token: sessionFor(person), name: person.name, email: person.email } }
    }

    async function accountDeleted(person: Person, body: any): Promise<Answer> {
        if (tooMany(`old of ${person.id}`)) return refuse(429, 'wait', WAIT)
        if (!(await holderBy(person.email, body?.password))) return refuse(401, 'wrong', 'The password is not right.')
        for (const song of mine(person)) removeSong(song)
        kept.sessions = kept.sessions.filter((one) => one.person !== person.id)
        kept.people = kept.people.filter((one) => one !== person)
        codes.delete(person.email)
        keep()
        return { status: 200, body: {} }
    }

    function renamed(person: Person, body: any): Answer {
        const name = clean(body?.name, NAME_LIMIT + 1)
        const unnamed = nameRefused(name)
        if (unnamed) return unnamed
        person.name = name
        keep()
        return meOf(person)
    }

    function published(person: Person, body: any): Answer {
        if (mine(person).length >= MOST_SONGS) return refuse(409, 'full', `All ${MOST_SONGS} of your songs are used. Delete one to make room for a new one.`)
        const text = typeof body?.file === 'string' ? body.file : ''
        const refused = checkSongFile(text, SONG_LIMIT)
        if (refused) return refuse(422, refused.why, refused.what, refused.line === undefined ? {} : { line: refused.line })
        const licence = LICENCES.find((one) => one === body?.licence)
        if (!licence) return refuse(400, 'licence', 'Choose what people may do with the song.')
        let preview: Buffer
        try {
            preview = Buffer.from(String(body?.preview ?? ''), 'base64')
        } catch {
            preview = Buffer.alloc(0)
        }
        if (!preview.length || preview.length > PREVIEW_LIMIT || !looksLikeAudio(preview)) return refuse(400, 'preview', 'The preview is missing, too long, or not sound.')
        const file = JSON.parse(text) as { name: string; code: string }
        const read = analyze(file.code)
        const peaks = peaksOf(body?.peaks)
        const seconds = secondsOf(body?.seconds)
        // A song says what it was reworked from only when that song is there to be opened, by
        // everyone or at least by its own maker.
        const from = kept.songs.find((one) => one.id === body?.from && (!one.hidden || one.by === person.id))
        let id = shortId()
        while (kept.songs.some((one) => one.id === id)) id = shortId()
        const song: Song = {
            id,
            by: person.id,
            name: clean(file.name, 60),
            description: clean(body?.description, DESCRIPTION_LIMIT),
            style: clean(body?.style, STYLE_LIMIT),
            licence,
            previewFrom: Math.max(0, Math.floor(Number(body?.previewFrom) || 0)),
            bytes: Buffer.byteLength(text),
            tempo: read.tempo?.bpm ?? null,
            patterns: read.patterns.map((pattern) => pattern.id).slice(0, 64),
            published: now(),
            hidden: false,
            plays: 0,
            downloads: 0,
            ...(peaks ? { peaks } : {}),
            ...(seconds ? { seconds } : {}),
            ...(from ? { from: from.id } : {}),
        }
        writeFileSync(join(songsDir, `${song.id}.weft`), text)
        writeFileSync(join(songsDir, `${song.id}.mp3`), preview)
        kept.songs.push(song)
        keep()
        return { status: 201, body: shown(song) }
    }

    // What its maker says about a song, changed after it was published. Whatever is not sent
    // stays as it is; the name, the code and the sounds are the file's and cannot be changed.
    function edited(song: Song, body: any): Answer {
        const licence = body?.licence === undefined ? song.licence : LICENCES.find((one) => one === body.licence)
        if (!licence) return refuse(400, 'licence', 'Choose what people may do with the song.')
        if (body?.description !== undefined) song.description = clean(body.description, DESCRIPTION_LIMIT)
        if (body?.style !== undefined) song.style = clean(body.style, STYLE_LIMIT)
        song.licence = licence
        keep()
        return { status: 200, body: shown(song) }
    }

    // The file as it is handed out: as it came, and saying which published song it is, so that
    // a song made from it can say what it was reworked from. The stored file is not touched.
    function handedOut(song: Song, text: string): string {
        try {
            return JSON.stringify({ ...JSON.parse(text), source: { id: song.id, name: song.name, by: nameOf(song.by) } })
        } catch {
            return text
        }
    }

    const note = (status: number, heading: string, lines: string[], go?: { href: string; label: string }): Answer => ({ status, html: notePage(around, `${heading}, Weft`, heading, lines, go) })
    const nothing = () => note(404, 'There is nothing at this address', ['The page may have moved, or the address may be mistyped.'], { href: '/', label: 'Go to the first page' })
    const noSong = () => note(404, 'No such song', ['It may have been hidden or deleted by whoever made it.'], { href: '/songs', label: 'See all songs' })

    // Anyone may say that something is wrong with a song. What they say is kept with the song
    // and the time, and handed on to whoever runs the site where the site was told how.
    function reported(song: Song, body: any, from: string): Answer {
        const back = { href: `/songs/${song.id}`, label: 'Back to the song' }
        const reason = clean(body?.reason, REASON_LIMIT)
        if (!reason) return note(400, 'The report says nothing', ['Say what is wrong with the song, then send it again.'], back)
        if (tooMany(`report from ${from}`)) return note(429, 'Too many reports', ['Too many reports came from here. Wait a quarter of an hour and send it again.'], back)
        if (kept.reports.length >= MOST_REPORTS) return note(503, 'The report was not kept', ['The site cannot take more reports just now.'], back)
        kept.reports.push({ song: song.id, reason, at: now() })
        keep()
        try {
            void Promise.resolve(options.reported?.({ id: song.id, name: song.name, reason })).catch(() => undefined)
        } catch {
            // A report is kept whether or not anyone could be told of it.
        }
        return note(200, 'The report is kept', ['It is kept with the song and the time it was sent.'], back)
    }

    // The pages, which are for everyone and know nobody. One form changes something, the
    // report of a song.
    function pageAnswer(request: IncomingMessage, url: URL, body: any, from: string): Answer {
        const path = url.pathname
        const get = request.method === 'GET'
        const post = request.method === 'POST'
        if (post && fromElsewhere(request)) return note(403, 'That did not come from this site', ['What is sent to this site from another site is not taken.'])

        if (get && path === '/') return { status: 200, html: homePage(around, kept.songs.filter((song) => !song.hidden).sort(newestFirst).slice(0, 4).map(listed), built()) }
        if (get && path === '/songs') {
            const search = searchOf(url)
            return { status: 200, html: songsPage(around, search, found(search)) }
        }
        if (get && path === '/licence') return { status: 200, html: licencePage(around, LICENCES) }
        if (get && path === '/privacy') return { status: 200, html: privacyPage(around) }
        if (get && path === '/download') return { status: 200, html: downloadPage(around, built()) }
        const wanted = /^\/download\/(macos|windows|linux)$/.exec(path)
        if (wanted && get) {
            const build = buildsNow().get(wanted[1] as Platform)
            if (!build || !existsSync(build.file)) return note(404, 'Not out yet', [`Weft for ${PLATFORM_NAMES[wanted[1] as Platform]} is not out yet.`], { href: '/download', label: 'See what is out' })
            return { status: 200, build: { file: build.file, bytes: statSync(build.file).size } }
        }

        // What an installed app asks to learn of a newer version, and the file it then fetches.
        // Without a release there is nothing to say, which the app takes as being up to date.
        const update = /^\/updates\/([^/]+)$/.exec(path)
        if (update && get) {
            const file = released(decodeURIComponent(update[1]))
            if (update[1] === 'latest.json') return file ? { status: 200, file: { bytes: readFileSync(file), type: 'application/json; charset=utf-8' } } : { status: 204 }
            return file && update[1] !== 'downloads.json' ? { status: 200, build: { file, bytes: statSync(file).size } } : note(404, 'Not here', ['There is no such file among the releases.'], { href: '/download', label: 'See what is out' })
        }

        const told = /^\/songs\/([a-z0-9]+)\/report$/.exec(path)
        if (told && post) {
            const song = kept.songs.find((one) => one.id === told[1] && !one.hidden)
            return song ? reported(song, body, from) : noSong()
        }

        const asset = /^\/songs\/([a-z0-9]+)(?:\.(weft|mp3|png))?$/.exec(path)
        if (asset && get) {
            const song = kept.songs.find((one) => one.id === asset[1] && !one.hidden)
            if (!song) return noSong()
            if (!asset[2]) {
                const more = kept.songs.filter((one) => one.by === song.by && one !== song && !one.hidden).sort(newestFirst)
                return { status: 200, html: songPage(around, shownOnPage(song), more.map(listed)) }
            }
            if (asset[2] === 'png') return { status: 200, file: { bytes: pictureOf(song), type: 'image/png' } }
            const stored = join(songsDir, `${song.id}.${asset[2]}`)
            if (!existsSync(stored)) return refuse(404, 'missing', 'The file is gone.')
            if (asset[2] === 'weft') song.downloads++
            else if (!request.headers.range || /^bytes=0-/.test(request.headers.range)) song.plays++
            keep()
            if (asset[2] === 'mp3') return { status: 200, file: { bytes: readFileSync(stored), type: 'audio/mpeg' } }
            return { status: 200, file: { bytes: Buffer.from(handedOut(song, readFileSync(stored, 'utf8'))), type: 'application/json', name: `${fileNameOf(song.name)}.weft` } }
        }
        return nothing()
    }

    async function answer(request: IncomingMessage, body: any): Promise<Answer> {
        const url = new URL(request.url ?? '/', 'http://site')
        const path = url.pathname
        const method = request.method ?? 'GET'
        const from = senderOf(request, options.behindProxy)

        const same = method === 'GET' ? fixed.get(path) : undefined
        if (same) return { status: 200, fixed: same }
        if (!path.startsWith('/api/')) return pageAnswer(request, url, body, from)

        if (method === 'GET' && path === '/api/ice') return iceFor(from)
        if (method === 'POST' && path === '/api/register') return registered(body, from)
        if (method === 'POST' && path === '/api/sign-in') return signedIn(body, from)
        if (method === 'POST' && path === '/api/password/forgot') return forgotten(body, from)
        if (method === 'POST' && path === '/api/password/reset') return passwordReset(body, from)

        const person = personOf(request)
        if (path === '/api/me' && method === 'GET') return person ? meOf(person) : signIn
        if (path === '/api/me' && method === 'POST') return person ? renamed(person, body) : signIn
        if (path === '/api/me' && method === 'DELETE') return person ? accountDeleted(person, body) : signIn
        if (path === '/api/password' && method === 'POST') return person ? passwordChanged(person, bearerOf(request) ?? '', body) : signIn
        if (path === '/api/sign-out' && method === 'POST') {
            const given = bearerOf(request)
            if (given) kept.sessions = kept.sessions.filter((one) => one.hash !== hashOf(given))
            keep()
            return { status: 200, body: {} }
        }
        if (path === '/api/songs' && method === 'POST') return person ? published(person, body) : signIn
        if (path === '/api/songs' && method === 'GET') {
            if (url.searchParams.has('mine')) return person ? { status: 200, body: { songs: mine(person).map(shown), used: mine(person).length, most: MOST_SONGS } } : signIn
            return { status: 200, body: { songs: kept.songs.filter((song) => !song.hidden).sort(newestFirst).slice(0, 100).map(shown) } }
        }
        const change = /^\/api\/songs\/([a-z0-9]+)(?:\/(hide|show))?$/.exec(path)
        if (change && (method === 'DELETE' || method === 'POST')) {
            if (!person) return signIn
            const song = kept.songs.find((one) => one.id === change[1] && one.by === person.id)
            if (!song) return refuse(404, 'missing', 'There is no such song of yours.')
            if (method === 'POST' && !change[2]) return edited(song, body)
            if (method === 'DELETE' && !change[2]) removeSong(song)
            else if (method === 'POST' && change[2]) {
                song.hidden = change[2] === 'hide'
                pictures.delete(song.id)
            } else return refuse(405, 'method', 'That cannot be done to a song.')
            keep()
            return { status: 200, body: { used: mine(person).length, most: MOST_SONGS } }
        }
        return refuse(404, 'missing', 'There is nothing at this address.')
    }

    function read(request: IncomingMessage): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const parts: Buffer[] = []
            let size = 0
            request.on('data', (part: Buffer) => {
                size += part.length
                if (size > BODY_LIMIT) return reject(new Error('large'))
                parts.push(part)
            })
            request.on('error', reject)
            request.on('end', () => {
                const text = Buffer.concat(parts).toString('utf8')
                if (!text) return resolve(null)
                if ((request.headers['content-type'] ?? '').includes('application/x-www-form-urlencoded')) return resolve(Object.fromEntries(new URLSearchParams(text)))
                try {
                    resolve(JSON.parse(text))
                } catch {
                    reject(new Error('unreadable'))
                }
            })
        })
    }

    function send(request: IncomingMessage, response: ServerResponse, given: Answer) {
        const from = request.headers.origin
        const headers: Record<string, string> = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' }
        if (from && allowed.has(from)) Object.assign(headers, { 'Access-Control-Allow-Origin': from, 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, DELETE', Vary: 'Origin' })
        if (given.fixed) {
            response.writeHead(given.status, { ...headers, 'Cache-Control': given.fixed.kept, 'Content-Type': given.fixed.type, 'Content-Length': String(given.fixed.bytes.length) })
            return response.end(given.fixed.bytes)
        }
        if (given.build) {
            response.writeHead(given.status, { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Length': String(given.build.bytes), 'Content-Disposition': `attachment; filename="${fileNameOf(basename(given.build.file))}"` })
            return createReadStream(given.build.file)
                .on('error', () => response.destroy())
                .pipe(response)
        }
        if (given.file) {
            response.writeHead(given.status, { ...headers, 'Content-Type': given.file.type, 'Content-Length': String(given.file.bytes.length), ...(given.file.name ? { 'Content-Disposition': `attachment; filename="${given.file.name}"` } : {}) })
            return response.end(given.file.bytes)
        }
        if (given.html !== undefined) {
            response.writeHead(given.status, { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': PAGE_RULES })
            return response.end(given.html)
        }
        response.writeHead(given.status, { ...headers, 'Content-Type': 'application/json' })
        response.end(JSON.stringify(given.body ?? {}))
    }

    // What could not be done is said the way it was asked: to the app as before, to a browser
    // as a page.
    function failed(request: IncomingMessage, err: Error): Answer {
        const refused = err.message === 'large' ? refuse(413, 'size', 'That is more than the site takes at once.') : err.message === 'unreadable' ? refuse(400, 'file', 'What was sent cannot be read.') : refuse(500, 'site', 'The site could not do that just now.')
        return (request.url ?? '').startsWith('/api/') ? refused : note(refused.status, 'That did not work', [(refused.body as { what: string }).what])
    }

    const server = createServer((request, response) => {
        if (request.method === 'OPTIONS') return send(request, response, { status: 204, body: {} })
        read(request)
            .then((body) => answer(request, body))
            .then(
                (given) => send(request, response, given),
                (err: Error) => send(request, response, failed(request, err)),
            )
    })

    return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(options.port, options.host ?? '127.0.0.1', () => {
            const address = server.address()
            const port = typeof address === 'object' && address ? address.port : options.port
            origin ||= `http://127.0.0.1:${port}`
            resolve({ port, origin, close: () => new Promise<void>((done) => server.close(() => done())) })
        })
    })
}
