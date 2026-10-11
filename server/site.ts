import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { join } from 'node:path'
import { checkSongFile, looksLikeAudio } from '../src/guard/file'
import { SONG_LIMIT } from '../src/library/songfile'
import { analyze } from '../src/song/analyze'

// The part of the site that songs are published to: who is signed in, the songs each person has
// published, and the files themselves. A person signs in with a link sent to their address, and
// the app holds what it is given in return. Every file that arrives is checked here, whoever
// sends it: a song file can be made by hand, so what the app checked counts for nothing.
export type SiteOptions = {
    port: number
    host?: string
    dataDir: string
    // The address people reach the site at, for the links it hands out.
    origin?: string
    // Sends the sign-in link. Without one the link is handed straight back to whoever asked,
    // which is only for trying the site out on one's own machine.
    mail?: (to: string, link: string) => void | Promise<void>
    allow?: string[]
    now?: () => number
}
export type Site = { port: number; origin: string; close: () => Promise<void> }

export const MOST_SONGS = 10
export const LICENCES = ['CC BY 4.0', 'CC BY-SA 4.0', 'CC0'] as const
type Licence = (typeof LICENCES)[number]

const PREVIEW_LIMIT = 700 * 1024
const BODY_LIMIT = 3 * 1024 * 1024
const SIGN_IN_FOR = 15 * 60 * 1000
const SESSION_FOR = 90 * 24 * 60 * 60 * 1000
const ASKS = 10
const ASKS_WITHIN = 15 * 60 * 1000
const DESCRIPTION_LIMIT = 500
const STYLE_LIMIT = 30
const NAME_LIMIT = 24
const APP_ORIGINS = ['http://localhost:5180', 'tauri://localhost', 'https://tauri.localhost', 'http://tauri.localhost']

type Person = { id: string; email: string; name: string; since: number }
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
}
type Kept = { people: Person[]; sessions: Session[]; songs: Song[] }
type Asking = { email: string; name: string; secret: string; link: string; until: number; approved: boolean }
type Answer = { status: number; body?: unknown; html?: string; file?: { bytes: Buffer; type: string; name?: string } }

const hashOf = (text: string) => createHash('sha256').update(text).digest('hex')
const token = (bytes = 32) => randomBytes(bytes).toString('base64url')
const shortId = () => randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').toLowerCase()
const clean = (value: unknown, most: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, most)
const emailOf = (value: unknown): string | null => {
    const email = String(value ?? '').trim().toLowerCase()
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}
const escaped = (text: string) => text.replace(/[&<>"']/g, (sign) => `&#${sign.charCodeAt(0)};`)

const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escaped(title)}</title>
<style>
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #18181a; color: #ece6d6; font: 15px/1.5 system-ui, sans-serif; }
main { width: min(440px, calc(100vw - 48px)); padding: 28px; border: 1px solid #3a3a40; border-radius: 14px; background: #1f1f22; }
h1 { margin: 0 0 8px; font: 600 24px/1.2 Georgia, serif; } p { margin: 0 0 14px; color: #b9b6af; } small { color: #8d8b86; }
button, a.b { display: inline-block; height: 38px; padding: 0 16px; border-radius: 9px; border: 0; background: #ece6d6; color: #18181a; font: 600 14px/38px system-ui, sans-serif; text-decoration: none; cursor: pointer; }
audio { width: 100%; margin: 6px 0 16px; }
</style></head><body><main>${body}</main></body></html>`

export function createSite(options: SiteOptions): Promise<Site> {
    const now = options.now ?? Date.now
    const songsDir = join(options.dataDir, 'songs')
    const keptFile = join(options.dataDir, 'site.json')
    mkdirSync(songsDir, { recursive: true })
    let kept: Kept = { people: [], sessions: [], songs: [] }
    if (existsSync(keptFile)) {
        try {
            kept = { ...kept, ...(JSON.parse(readFileSync(keptFile, 'utf8')) as Partial<Kept>) }
        } catch {
            throw new Error(`${keptFile} cannot be read. It is left as it is; move it away to start afresh.`)
        }
    }
    const keep = () => {
        writeFileSync(`${keptFile}.new`, JSON.stringify(kept))
        renameSync(`${keptFile}.new`, keptFile)
    }
    const asking = new Map<string, Asking>()
    const asked = new Map<string, number[]>()
    const allowed = new Set(options.allow ?? APP_ORIGINS)
    let origin = options.origin ?? ''

    const tooMany = (who: string): boolean => {
        const since = now() - ASKS_WITHIN
        const times = (asked.get(who) ?? []).filter((at) => at > since)
        times.push(now())
        asked.set(who, times)
        return times.length > ASKS
    }

    const personOf = (request: IncomingMessage): Person | null => {
        const given = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1]
        if (!given) return null
        const session = kept.sessions.find((one) => one.hash === hashOf(given) && one.until > now())
        return session ? (kept.people.find((person) => person.id === session.person) ?? null) : null
    }
    const mine = (person: Person) => kept.songs.filter((song) => song.by === person.id)
    const shown = (song: Song) => {
        const by = kept.people.find((person) => person.id === song.by)
        return { ...song, by: by?.name ?? 'Someone', url: `${origin}/songs/${song.id}`, file: `${origin}/songs/${song.id}.weft`, preview: `${origin}/songs/${song.id}.mp3` }
    }
    const refuse = (status: number, why: string, what: string, more: object = {}): Answer => ({ status, body: { why, what, ...more } })
    const signIn: Answer = refuse(401, 'signin', 'Sign in first.')

    async function signInAsked(body: any, from: string): Promise<Answer> {
        const email = emailOf(body?.email)
        if (!email) return refuse(400, 'email', 'That is not an address a link can be sent to.')
        if (tooMany(`ip ${from}`) || tooMany(`to ${email}`)) return refuse(429, 'wait', 'Too many links were asked for. Wait a quarter of an hour and ask again.')
        const id = token(12)
        const secret = token()
        const link = `${origin}/sign-in/confirm?token=${token()}`
        asking.set(id, { email, name: clean(body?.name, NAME_LIMIT), secret: hashOf(secret), link, until: now() + SIGN_IN_FOR, approved: false })
        if (!options.mail) return { status: 200, body: { id, secret, link } }
        await options.mail(email, link)
        return { status: 200, body: { id, secret } }
    }

    const askedBy = (link: string) => [...asking.values()].find((one) => one.link === link && one.until > now())

    // The link in the mail only shows a button. Signing in happens when the button is pressed,
    // so that a mail program that opens every link to look at it signs nobody in.
    function confirmPage(given: string | null, press: boolean): Answer {
        const found = given ? askedBy(`${origin}/sign-in/confirm?token=${given}`) : undefined
        if (!found) return { status: 410, html: page('Weft', '<h1>This link is used up</h1><p>A sign-in link works once, for a quarter of an hour. Ask for a new one in Weft.</p>') }
        if (!press) {
            return {
                status: 200,
                html: page('Sign in to Weft', `<h1>Sign in to Weft</h1><p>As ${escaped(found.email)}. Press the button, then go back to the app.</p><form method="post" action="/sign-in/confirm"><input type="hidden" name="token" value="${escaped(given!)}"><button>Sign in</button></form>`),
            }
        }
        found.approved = true
        return { status: 200, html: page('Signed in', '<h1>You are signed in</h1><p>Go back to Weft. This page can be closed.</p>') }
    }

    function polled(body: any): Answer {
        const found = asking.get(String(body?.id ?? ''))
        if (!found || found.until <= now() || found.secret !== hashOf(String(body?.secret ?? ''))) return { status: 200, body: { state: 'gone' } }
        if (!found.approved) return { status: 200, body: { state: 'waiting' } }
        asking.delete(String(body.id))
        let person = kept.people.find((one) => one.email === found.email)
        if (!person) {
            person = { id: shortId(), email: found.email, name: found.name || 'Someone', since: now() }
            kept.people.push(person)
        } else if (found.name) person.name = found.name
        const session = token()
        kept.sessions = kept.sessions.filter((one) => one.until > now())
        kept.sessions.push({ hash: hashOf(session), person: person.id, until: now() + SESSION_FOR })
        keep()
        return { status: 200, body: { state: 'done', token: session, name: person.name, email: person.email } }
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
        const song: Song = {
            id: shortId(),
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
        }
        writeFileSync(join(songsDir, `${song.id}.weft`), text)
        writeFileSync(join(songsDir, `${song.id}.mp3`), preview)
        kept.songs.push(song)
        keep()
        return { status: 201, body: shown(song) }
    }

    function songPage(song: Song): Answer {
        const made = shown(song)
        const facts = [made.style, made.tempo ? `${Math.round(made.tempo)} bpm` : '', `${made.patterns.length} patterns`, made.licence].filter(Boolean).map(escaped).join(', ')
        return {
            status: 200,
            html: page(
                made.name,
                `<h1>${escaped(made.name)}</h1><p>by ${escaped(made.by)}<br><small>${facts}</small></p>${made.description ? `<p>${escaped(made.description)}</p>` : ''}<audio controls preload="none" src="/songs/${made.id}.mp3"></audio><a class="b" href="/songs/${made.id}.weft">Download .weft</a>`,
            ),
        }
    }

    async function answer(request: IncomingMessage, body: any): Promise<Answer> {
        const url = new URL(request.url ?? '/', 'http://site')
        const path = url.pathname
        const method = request.method ?? 'GET'
        const from = request.socket.remoteAddress ?? ''

        if (method === 'POST' && path === '/api/sign-in') return signInAsked(body, from)
        if (method === 'POST' && path === '/api/sign-in/poll') return polled(body)
        if (method === 'GET' && path === '/sign-in/confirm') return confirmPage(url.searchParams.get('token'), false)
        if (method === 'POST' && path === '/sign-in/confirm') return confirmPage(typeof body?.token === 'string' ? body.token : null, true)

        const person = personOf(request)
        if (path === '/api/me' && method === 'GET') return person ? { status: 200, body: { name: person.name, email: person.email, used: mine(person).length, most: MOST_SONGS } } : signIn
        if (path === '/api/sign-out' && method === 'POST') {
            const given = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1]
            if (given) kept.sessions = kept.sessions.filter((one) => one.hash !== hashOf(given))
            keep()
            return { status: 200, body: {} }
        }
        if (path === '/api/songs' && method === 'POST') return person ? published(person, body) : signIn
        if (path === '/api/songs' && method === 'GET') {
            if (url.searchParams.has('mine')) return person ? { status: 200, body: { songs: mine(person).map(shown), used: mine(person).length, most: MOST_SONGS } } : signIn
            return { status: 200, body: { songs: kept.songs.filter((song) => !song.hidden).sort((a, b) => b.published - a.published).slice(0, 100).map(shown) } }
        }
        const change = /^\/api\/songs\/([a-z0-9]+)(?:\/(hide|show))?$/.exec(path)
        if (change && (method === 'DELETE' || method === 'POST')) {
            if (!person) return signIn
            const song = kept.songs.find((one) => one.id === change[1] && one.by === person.id)
            if (!song) return refuse(404, 'missing', 'There is no such song of yours.')
            if (method === 'DELETE' && !change[2]) {
                kept.songs = kept.songs.filter((one) => one !== song)
                for (const ending of ['weft', 'mp3']) rmSync(join(songsDir, `${song.id}.${ending}`), { force: true })
            } else if (method === 'POST' && change[2]) song.hidden = change[2] === 'hide'
            else return refuse(405, 'method', 'That cannot be done to a song.')
            keep()
            return { status: 200, body: { used: mine(person).length, most: MOST_SONGS } }
        }

        const asset = /^\/songs\/([a-z0-9]+)(?:\.(weft|mp3))?$/.exec(path)
        if (asset && method === 'GET') {
            const song = kept.songs.find((one) => one.id === asset[1] && !one.hidden)
            if (!song) return { status: 404, html: page('Weft', '<h1>No such song</h1><p>It may have been hidden or deleted by whoever made it.</p>') }
            if (!asset[2]) return songPage(song)
            const stored = join(songsDir, `${song.id}.${asset[2]}`)
            if (!existsSync(stored)) return refuse(404, 'missing', 'The file is gone.')
            if (asset[2] === 'weft') song.downloads++
            else if (!request.headers.range || /^bytes=0-/.test(request.headers.range)) song.plays++
            keep()
            return { status: 200, file: { bytes: readFileSync(stored), type: asset[2] === 'weft' ? 'application/json' : 'audio/mpeg', ...(asset[2] === 'weft' ? { name: `${song.name.replace(/[^\w .-]+/g, '_')}.weft` } : {}) } }
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
        if (given.file) {
            response.writeHead(given.status, { ...headers, 'Content-Type': given.file.type, 'Content-Length': String(given.file.bytes.length), ...(given.file.name ? { 'Content-Disposition': `attachment; filename="${given.file.name}"` } : {}) })
            return response.end(given.file.bytes)
        }
        if (given.html !== undefined) {
            response.writeHead(given.status, { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; media-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" })
            return response.end(given.html)
        }
        response.writeHead(given.status, { ...headers, 'Content-Type': 'application/json' })
        response.end(JSON.stringify(given.body ?? {}))
    }

    const server = createServer((request, response) => {
        if (request.method === 'OPTIONS') return send(request, response, { status: 204, body: {} })
        read(request)
            .then((body) => answer(request, body))
            .then(
                (given) => send(request, response, given),
                (err: Error) => send(request, response, err.message === 'large' ? refuse(413, 'size', 'That is more than the site takes at once.') : err.message === 'unreadable' ? refuse(400, 'file', 'What was sent cannot be read.') : refuse(500, 'site', 'The site could not do that just now.')),
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
