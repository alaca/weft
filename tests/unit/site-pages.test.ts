import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSite, type Site, type SiteOptions } from '../../server/site'
import { writeSongFile, type SongFile } from '../../src/library/songfile'

let site: Site
let dataDir: string
// Noon on 6 October 2026, and every test starts there.
const NOON = 1_791_288_000_000
let clock = NOON

const RULES = "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; media-src 'self'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"

const start = async (more: Partial<SiteOptions> = {}) => (site = await createSite({ port: 0, dataDir, now: () => clock, ...more }))
const ask = (path: string, init: RequestInit & { token?: string; json?: unknown } = {}) =>
    fetch(site.origin + path, {
        ...init,
        ...(init.json === undefined ? {} : { method: init.method ?? 'POST', body: JSON.stringify(init.json) }),
        headers: { ...(init.json === undefined ? {} : { 'Content-Type': 'application/json' }), ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}), ...init.headers },
    })
const page = async (path: string) => (await fetch(site.origin + path)).text()
const send = (path: string, fields: Record<string, string>, headers: Record<string, string> = {}) =>
    fetch(site.origin + path, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(fields).toString() })
const signIn = async (email = 'ante@example.com', name = 'Ante'): Promise<string> => (await (await ask('/api/register', { json: { email, password: 'a long enough one', name } })).json()).token
const kept = () => JSON.parse(readFileSync(join(dataDir, 'site.json'), 'utf8'))

const mp3 = (bytes = 2000) => Buffer.from(Uint8Array.from({ length: bytes }, (_, at) => (at === 0 ? 0xff : at === 1 ? 0xfb : 0))).toString('base64')
const wav = (bytes = 64) => {
    const data = new Uint8Array(bytes)
    data.set([...'RIFF'].map((letter) => letter.charCodeAt(0)), 0)
    data.set([...'WAVE'].map((letter) => letter.charCodeAt(0)), 8)
    return data
}
const song = (parts: Partial<SongFile> = {}) => writeSongFile({ name: 'Slow burn', code: 'setcpm(84/4)\n\ndrums: s("bd*4").bank("EmuSP12")\nvoc: s("take")\n', keys: {}, sounds: [{ name: 'take', file: 'take.wav', type: 'audio/wav', seconds: 1.5, data: wav(3000) }], ...parts })
const plain = (name: string, tempo = 120) => song({ name, code: `setcpm(${tempo}/4)\n\ndrums: s("bd*4")\n`, sounds: [] })
// Each song is published a second after the one before, so that which is newest is certain.
const publish = async (token: string, more: Record<string, unknown> = {}) => {
    clock += 1000
    return (await ask('/api/songs', { token, json: { file: song(), preview: mp3(), description: 'Slow.', style: 'trip hop', licence: 'CC BY 4.0', previewFrom: 28, ...more } })).json()
}
const names = (html: string) => [...html.matchAll(/<h3><a href="\/songs\/[a-z0-9]+">([^<]*)<\/a><\/h3>/g)].map((found) => found[1])

beforeEach(async () => {
    clock = NOON
    dataDir = mkdtempSync(join(tmpdir(), 'weft-pages-'))
    await start()
})

afterEach(async () => {
    await site.close()
    rmSync(dataDir, { recursive: true, force: true })
})

describe('the first page', () => {
    it('shows the four newest songs with their previews, and says so when there are none', async () => {
        expect(await page('/')).toContain('Nothing is published yet.')
        const token = await signIn()
        const made = []
        for (const name of ['One', 'Two', 'Three', 'Four', 'Five']) made.push(await publish(token, { file: plain(name), peaks: [0, 1] }))
        await ask(`/api/songs/${made[3].id}/hide`, { token, method: 'POST' })
        const html = await page('/')
        expect(names(html)).toEqual(['Five', 'Three', 'Two', 'One'])
        expect(html).toContain('<h1>Weave songs from patterns.</h1>')
        expect(html).toContain('<h3>Jams</h3>')
        expect(html).toContain(`<a class="play" href="/songs/${made[4].id}.mp3" aria-label="Play the preview of Five">`)
        expect(html).toContain(`<path id="w-${made[4].id}" vector-effect="non-scaling-stroke" d="M2 17.8V22.2`)
        expect(html).toContain(`href="/songs/${made[4].id}.weft" aria-label="Download Five as a .weft file"`)
        expect(html).toContain('<span class="num">120 bpm</span>')
        expect(html.match(/<img src="\/app-[123]\.png" width="1440" height="900"/g)).toHaveLength(3)
        expect(html).not.toContain(made[3].id)
    })

    it('sends each download button to its build when there is one, and to the download page when not', async () => {
        expect((await page('/')).match(/<a class="btn[^"]*" href="\/download">/g)).toHaveLength(4)
        await site.close()
        const build = join(dataDir, 'Weft 0.1.0.dmg')
        writeFileSync(build, 'not really an installer')
        await start({ downloads: [{ platform: 'macos', file: build, version: '0.1.0' }] })
        const html = await page('/')
        expect(html).toContain('<a class="btn go" href="/download/macos">')
        expect(html).toContain('<a class="btn" href="/download">Windows</a>')
        expect(html).toContain('<a class="btn" href="/download">Linux</a>')
    })

    it('links to the source code only when the site is told where it is', async () => {
        expect(await page('/')).not.toContain('Source code')
        await site.close()
        await start({ source: 'https://example.com/weft' })
        expect((await page('/')).match(/href="https:\/\/example.com\/weft" rel="noopener">Source code</g)).toHaveLength(3)
        await site.close()
        await start({ source: 'javascript:alert(1)' })
        expect(await page('/')).not.toContain('Source code')
    })
})

describe('the list of songs', () => {
    const seed = async () => {
        const ante = await signIn()
        const mara = await signIn('mara@example.com', 'Mara')
        const slow = await publish(ante, { file: plain('Slow burn', 84), style: 'trip hop' })
        const night = await publish(mara, { file: plain('Night shift', 174), style: 'drum and bass' })
        const low = await publish(mara, { file: plain('Low sun', 122), style: 'melodic techno' })
        const still = await publish(ante, { file: song({ name: 'Stillness', code: 'drums: s("bd*4")\n', sounds: [] }), style: 'ambient' })
        for (let count = 0; count < 3; count++) await fetch(`${site.origin}/songs/${night.id}.weft`)
        await fetch(`${site.origin}/songs/${slow.id}.weft`)
        return { ante, mara, slow, night, low, still }
    }

    it('has every published song, newest first, with what a row tells', async () => {
        const { ante, night, low } = await seed()
        await ask(`/api/songs/${low.id}/hide`, { token: ante, method: 'POST' })
        const html = await page('/songs')
        expect(names(html)).toEqual(['Stillness', 'Low sun', 'Night shift', 'Slow burn'])
        expect(html).toContain('<span class="mono">4 songs</span>')
        expect(html).toContain(`<a class="chip" href="/songs?q=drum%20and%20bass" title="Songs tagged drum and bass">drum and bass</a>`)
        expect(html).toContain('<span class="num">174 bpm</span>')
        expect(html).toContain('<span class="num">1<small> pattern</small></span>')
        expect(html).toContain('<span class="num">0:22</span>')
        expect(html).toContain('<span class="num">3<small> downloads</small></span>')
        expect(html).toContain(`<a class="btn sm" href="/songs/${night.id}.weft" aria-label="Download Night shift as a .weft file">`)
        expect(html).toContain('placeholder="84" aria-label="Slowest tempo, bpm"')
        expect(html).toContain('placeholder="174" aria-label="Fastest tempo, bpm"')
    })

    it('is searched by name, maker and style', async () => {
        await seed()
        expect(names(await page('/songs?q=NIGHT'))).toEqual(['Night shift'])
        expect(names(await page('/songs?q=mara'))).toEqual(['Low sun', 'Night shift'])
        expect(names(await page('/songs?q=techno'))).toEqual(['Low sun'])
        const none = await page('/songs?q=polka')
        expect(names(none)).toEqual([])
        expect(none).toContain('No song matches that.')
        expect(none).toContain('<span class="mono">0 songs</span>')
        expect(await page('/songs?q=night')).toContain('name="q" value="night"')
    })

    it('is put in order of downloads, and narrowed to a range of tempo', async () => {
        await seed()
        const most = await page('/songs?sort=downloads')
        expect(names(most)).toEqual(['Night shift', 'Slow burn', 'Stillness', 'Low sun'])
        expect(most).toContain('<a href="/songs?sort=downloads" aria-current="true">Most downloaded</a>')
        expect(names(await page('/songs?from=100'))).toEqual(['Low sun', 'Night shift'])
        expect(names(await page('/songs?to=122'))).toEqual(['Low sun', 'Slow burn'])
        expect(names(await page('/songs?from=100&to=130&sort=downloads&q=mara'))).toEqual(['Low sun'])
        expect(names(await page('/songs?from=abc&to=-4'))).toHaveLength(4)
    })

    it('is turned 24 songs at a time with plain links', async () => {
        const people = [await signIn(), await signIn('mara@example.com', 'Mara'), await signIn('tomo@example.com', 'Tomo')]
        for (let count = 1; count <= 25; count++) await publish(people[count % 3], { file: plain(`Song ${count}`) })
        const first = await page('/songs?q=song')
        expect(names(first)).toHaveLength(24)
        expect(names(first)[0]).toBe('Song 25')
        expect(first).toContain('Page 1 of 2')
        expect(first).toContain('<a class="btn sm" href="/songs?q=song&#38;page=2">Next</a>')
        expect(first).not.toContain('Previous')
        const second = await page('/songs?q=song&page=2')
        expect(names(second)).toEqual(['Song 1'])
        expect(second).toContain('<a class="btn sm" href="/songs?q=song">Previous</a>')
        expect(second).not.toContain('>Next<')
        expect(await page('/songs?page=9')).toContain('There is no such page.')
    })
})

describe('the page of a song', () => {
    it('tells what the file holds: patterns with their sounds, the maker\'s own sounds, sizes and counts', async () => {
        const token = await signIn()
        const made = await publish(token, { seconds: 30, peaks: Array(160).fill(1) })
        await fetch(made.preview)
        await fetch(made.file)
        const html = await page(`/songs/${made.id}`)
        expect(html).toContain('<title>Slow burn by Ante, Weft</title>')
        expect(html).toContain('<h1>Slow burn</h1>')
        expect(html).toContain('<span>Published 6 October 2026</span>')
        expect(html).toContain('<span>30 seconds, from bar 29</span>')
        expect(html).toContain('<p class="about">Slow.</p>')
        expect(html).toContain('<li><i class="dot c0"></i><b>drums</b><code>EmuSP12</code></li>')
        expect(html).toContain('<li class="own"><i class="dot c1"></i><b>voc</b><code>take</code></li>')
        expect(html).toContain('<h2 id="h-snds">Sounds of Ante\'s own</h2>')
        expect(html).toContain('<code>take</code>')
        expect(html).toMatch(/<p>WAV, 1.5 seconds <i class="dot c1"><\/i> used by <b>voc<\/b> <\/p>/)
        expect(html).toContain('<span class="num">3 KB</span>')
        expect(html).toContain('<div><dt>Tempo</dt><dd>84 bpm</dd></div>')
        expect(html).toContain('<div><dt>Length</dt><dd>16 bars, 46 seconds</dd></div>')
        expect(html).toContain('<div><dt>Patterns</dt><dd>2</dd></div>')
        expect(html).toContain('<div><dt>Sounds of Ante\'s own</dt><dd>1, 3 KB</dd></div>')
        expect(html).toContain('<div><dt>File size</dt><dd>4 KB</dd></div>')
        expect(html).toContain('<div><dt>Plays of the preview</dt><dd>1</dd></div>')
        expect(html).toContain('<div><dt>Downloads</dt><dd>1</dd></div>')
        expect(html).toContain('<p class="mono">Slow burn.weft, 4 KB</p>')
        expect(html).toContain('<b>CC BY 4.0</b>')
        expect(html).toContain('You may rework this song and share what you make, as long as you credit Ante.')
        expect(html).toContain(`<a class="btn go" href="/songs/${made.id}.weft">`)
        expect(html).toContain(`<a class="btn" href="weft://song/${made.id}">`)
        expect(html).toContain('Needs the Weft app on this machine.')
        expect(html).toContain(`<form method="post" action="/songs/${made.id}/report">`)
        expect(html).toContain('<path id="w-preview" vector-effect="non-scaling-stroke" d="M2 3V37M6 3V37')
    })

    it('draws an even row of low strokes for a preview whose loudness was never sent, and counts a long song in minutes', async () => {
        const token = await signIn()
        const long = song({ code: 'setcpm(84/4)\n\ndrums: s("bd*4").mask("<0!8 1!56>")\nvoc: s("take").mask("<1!64>")\n' })
        const made = await publish(token, { file: long, licence: 'CC0', style: '', description: '' })
        const html = await page(`/songs/${made.id}`)
        expect(html).toContain('d="M2 17V23M6 17V23M10 17V23')
        expect(html).toContain('<span>It starts from bar 29</span>')
        expect(html).toContain('<dd>64 bars, 3 min 3 s</dd>')
        expect(html).toContain('You may do anything with this song. You do not have to credit Ante.')
        expect(html).not.toContain('class="about"')
        expect(html).not.toContain('class="chip"')
        expect(html).not.toContain('More by')
    })

    it('lists the other songs of the same maker, and no hidden one', async () => {
        const token = await signIn()
        const made = await publish(token)
        const other = await publish(token, { file: plain('Undertow', 80) })
        const hidden = await publish(token, { file: plain('Glasshouse', 124) })
        await publish(await signIn('mara@example.com', 'Mara'), { file: plain('Low sun', 122) })
        await ask(`/api/songs/${hidden.id}/hide`, { token, method: 'POST' })
        const html = await page(`/songs/${made.id}`)
        expect(html).toContain('<h2 id="h-more">More by Ante</h2>')
        expect(names(html)).toEqual(['Undertow'])
        expect(html).toContain('<span class="num">1 pattern</span>')
        expect(html).toContain(`href="/songs/${other.id}.weft"`)
        expect((await fetch(`${site.origin}/songs/${hidden.id}`)).status).toBe(404)
        expect((await fetch(`${site.origin}/songs/nosuchsong`)).status).toBe(404)
    })

    it('says what it was reworked from with a link, and drops the line when that song is hidden or gone', async () => {
        const mara = await signIn('mara@example.com', 'Mara')
        const first = await publish(mara, { file: plain('Low sun', 122) })
        const made = await publish(await signIn(), { from: first.id })
        const line = `<a class="from" href="/songs/${first.id}">`
        const html = await page(`/songs/${made.id}`)
        expect(html).toContain(line)
        expect(html).toContain('<span>Reworked from <b>Low sun</b> by Mara</span>')
        expect(await page(`/songs/${first.id}`)).not.toContain('Reworked from')
        await ask(`/api/songs/${first.id}/hide`, { token: mara, method: 'POST' })
        const hidden = await page(`/songs/${made.id}`)
        expect(hidden).not.toContain('Reworked from')
        expect(hidden).not.toContain(first.id)
        await ask(`/api/songs/${first.id}/show`, { token: mara, method: 'POST' })
        expect(await page(`/songs/${made.id}`)).toContain(line)
        await ask(`/api/songs/${first.id}`, { token: mara, method: 'DELETE' })
        const gone = await page(`/songs/${made.id}`)
        expect(gone).not.toContain('Reworked from')
        expect(gone).not.toContain(first.id)
    })

    it('tells wherever its address is pasted its name, who made it and where its picture and sound are, in whole addresses or not at all', async () => {
        const made = await publish(await signIn())
        const bare = await page(`/songs/${made.id}`)
        expect(bare).toContain('<meta property="og:title" content="Slow burn">')
        expect(bare).toContain('<meta property="og:description" content="By Ante, trip hop, 84 bpm. Slow.">')
        expect(bare).not.toMatch(/og:image|og:url|og:audio|twitter:card|rel="canonical"/)
        await site.close()
        await start({ origin: 'https://weft.example' })
        const here = `http://127.0.0.1:${site.port}`
        const html = await (await fetch(`${here}/songs/${made.id}`)).text()
        const whole = `https://weft.example/songs/${made.id}`
        expect(html).toContain('<meta property="og:type" content="music.song">')
        expect(html).toContain('<meta property="og:site_name" content="Weft">')
        expect(html).toContain(`<meta property="og:url" content="${whole}">`)
        expect(html).toContain(`<meta property="og:image" content="${whole}.png">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">`)
        expect(html).toContain(`<meta property="og:audio" content="${whole}.mp3">\n<meta property="og:audio:type" content="audio/mpeg">`)
        expect(html).toContain('<meta name="twitter:card" content="summary_large_image">')
        expect(html).toContain(`<link rel="canonical" href="${whole}">`)
        expect(await (await fetch(`${here}/songs`)).text()).toContain('<meta property="og:image" content="https://weft.example/app-1.png">')
    })

    it('has a picture of its preview, 1200 dots wide and 630 high, and none while it is hidden', async () => {
        const token = await signIn()
        const made = await publish(token, { peaks: [0.2, 0.8] })
        const answer = await fetch(`${site.origin}/songs/${made.id}.png`)
        expect([answer.status, answer.headers.get('content-type')]).toEqual([200, 'image/png'])
        const picture = Buffer.from(await answer.arrayBuffer())
        expect(picture.subarray(1, 4).toString()).toBe('PNG')
        expect([picture.readUInt32BE(16), picture.readUInt32BE(20)]).toEqual([1200, 630])
        await ask(`/api/songs/${made.id}/hide`, { token, method: 'POST' })
        expect((await fetch(`${site.origin}/songs/${made.id}.png`)).status).toBe(404)
        expect((await fetch(`${site.origin}/songs/nosuchsong.png`)).status).toBe(404)
    })
})

describe('reporting a song', () => {
    it('keeps what was said with the song and the time, from anyone', async () => {
        const made = await publish(await signIn())
        const answer = await send(`/songs/${made.id}/report`, { reason: `  These are not\n their samples. ${'x'.repeat(600)}` })
        expect(answer.status).toBe(200)
        expect(answer.headers.get('set-cookie')).toBeNull()
        expect(await answer.text()).toContain('The report is kept')
        expect(kept().reports).toEqual([{ song: made.id, reason: `These are not their samples. ${'x'.repeat(471)}`, at: clock }])
        const empty = await send(`/songs/${made.id}/report`, { reason: '   ' })
        expect(empty.status).toBe(400)
        expect(await empty.text()).toContain('The report says nothing')
        expect((await send('/songs/nosuchsong/report', { reason: 'Nothing' })).status).toBe(404)
        expect(kept().reports).toHaveLength(1)
    })

    it('is not taken from another site, more than ten times in a quarter of an hour, or for a hidden song', async () => {
        const token = await signIn()
        const made = await publish(token)
        const hidden = await publish(token)
        await ask(`/api/songs/${hidden.id}/hide`, { token, method: 'POST' })
        expect((await send(`/songs/${hidden.id}/report`, { reason: 'Hidden' })).status).toBe(404)
        const forged: Record<string, string>[] = [{ Origin: 'https://example.com' }, { Origin: 'null', 'Sec-Fetch-Site': 'cross-site' }, { Origin: site.origin, 'Sec-Fetch-Site': 'same-site' }, { Origin: 'not an origin' }]
        for (const headers of forged) expect([headers, (await send(`/songs/${made.id}/report`, { reason: 'Forged' }, headers)).status]).toEqual([headers, 403])
        expect(kept().reports).toEqual([])
        // What a browser sends with the form of the song's own page, which asks for no referrer.
        expect((await send(`/songs/${made.id}/report`, { reason: 'From here' }, { Origin: 'null', 'Sec-Fetch-Site': 'same-origin' })).status).toBe(200)
        expect((await send(`/songs/${made.id}/report`, { reason: 'From here too' }, { Origin: site.origin })).status).toBe(200)
        let last = 0
        for (let count = 0; count < 9; count++) last = (await send(`/songs/${made.id}/report`, { reason: `Again ${count}` })).status
        expect(last).toBe(429)
        expect(kept().reports).toHaveLength(10)
        clock += 16 * 60 * 1000
        expect((await send(`/songs/${made.id}/report`, { reason: 'Later' })).status).toBe(200)
    })
})

describe('the downloads', () => {
    it('are said to be not out yet when nothing is built', async () => {
        const html = await page('/download')
        expect(html.match(/<p>Not out yet\.<\/p>/g)).toHaveLength(3)
        expect(html).toContain('Weft is not released yet, so there is nothing to download.')
        expect(html).not.toContain('href="/download/')
        for (const platform of ['macos', 'windows', 'linux']) {
            const answer = await fetch(`${site.origin}/download/${platform}`)
            expect(answer.status).toBe(404)
            expect(await answer.text()).toContain('is not out yet.')
        }
        expect((await fetch(`${site.origin}/download/amiga`)).status).toBe(404)
    })

    it('hand out each build that is there under its own name, with its version and size', async () => {
        await site.close()
        const mac = join(dataDir, 'Weft 0.1.0 (arm64).dmg')
        const linux = join(dataDir, 'weft_0.1.0_amd64.AppImage')
        writeFileSync(mac, Buffer.alloc(300 * 1024, 7))
        writeFileSync(linux, 'an image')
        await start({ downloads: [{ platform: 'macos', file: mac, version: '0.1.0' }, { platform: 'linux', file: linux, version: '0.1.0-beta' }, { platform: 'windows', file: join(dataDir, 'missing.msi'), version: '0.1.0' }] })
        const html = await page('/download')
        expect(html).toContain('<span class="num">Version 0.1.0, 0.3 MB</span>')
        expect(html).toContain('<span class="num">Version 0.1.0-beta, 1 KB</span>')
        expect(html).toContain('This build is not signed with Apple yet, so macOS will not open it the first time.')
        expect(html.match(/This build is not signed/g)).toHaveLength(1)
        expect(html.match(/<p>Not out yet\.<\/p>/g)).toHaveLength(1)
        expect(html).toContain('<a class="btn go" href="/download/macos" aria-label="Download Weft for macOS">')
        expect(html).not.toContain('href="/download/windows"')
        const file = await fetch(`${site.origin}/download/macos`)
        expect(file.status).toBe(200)
        expect(file.headers.get('content-disposition')).toBe('attachment; filename="Weft 0.1.0 _arm64_.dmg"')
        expect(file.headers.get('content-type')).toBe('application/octet-stream')
        expect(file.headers.get('cache-control')).toBe('no-store')
        expect(Buffer.from(await file.arrayBuffer()).equals(readFileSync(mac))).toBe(true)
        expect(await (await fetch(`${site.origin}/download/linux`)).text()).toBe('an image')
        expect((await fetch(`${site.origin}/download/windows`)).status).toBe(404)
    })
})

describe('the page about privacy', () => {
    it('says what is kept and is linked from the foot of every page', async () => {
        const html = await page('/privacy')
        for (const said of ['Your password is not kept', 'Your email is shown to nobody', 'kept for two weeks', 'The site sets no cookies']) expect(html).toContain(said)
        for (const path of ['/', '/songs', '/download', '/licence']) expect(await page(path)).toContain('<a href="/privacy">Privacy</a>')
    })
})

describe('a report of a song', () => {
    it('is told to whoever looks after the site as it is kept, and is kept also when telling fails', async () => {
        await site.close()
        const told: { id: string; name: string; reason: string }[] = []
        await start({
            reported: (report) => {
                told.push(report)
                throw new Error('the mail did not leave')
            },
        })
        const made = await publish(await signIn())
        const answer = await send(`/songs/${made.id}/report`, { reason: 'This is not a song.' })
        expect(answer.status).toBe(200)
        expect(told).toEqual([{ id: made.id, name: expect.any(String), reason: 'This is not a song.' }])
        expect(JSON.parse(readFileSync(join(dataDir, 'site.json'), 'utf8')).reports).toHaveLength(1)
    })
})

describe('a folder of releases', () => {
    it('tells an installed app of the newest version, hands it the file, and gives nothing else of the machine away', async () => {
        await site.close()
        const releases = join(dataDir, 'releases')
        mkdirSync(releases)
        await start({ releases })
        expect((await fetch(`${site.origin}/updates/latest.json`)).status).toBe(204)
        const latest = { version: '0.2.0', notes: 'New things.', pub_date: '2026-10-11T12:00:00Z', platforms: { 'darwin-aarch64': { signature: 'c2ln', url: 'https://weftloom.dev/updates/Weft_0.2.0_aarch64.app.tar.gz' } } }
        writeFileSync(join(releases, 'latest.json'), JSON.stringify(latest))
        writeFileSync(join(releases, 'Weft_0.2.0_aarch64.app.tar.gz'), Buffer.alloc(2048, 3))
        writeFileSync(join(dataDir, 'secret.txt'), 'not for anyone')
        const told = await fetch(`${site.origin}/updates/latest.json`)
        expect([told.status, told.headers.get('content-type'), told.headers.get('cache-control')]).toEqual([200, 'application/json; charset=utf-8', 'no-store'])
        expect(await told.json()).toEqual(latest)
        const file = await fetch(`${site.origin}/updates/Weft_0.2.0_aarch64.app.tar.gz`)
        expect([file.status, file.headers.get('content-type'), (await file.arrayBuffer()).byteLength]).toEqual([200, 'application/octet-stream', 2048])
        for (const path of ['/updates/..%2Fsecret.txt', '/updates/%2E%2E%2Fsite.json', '/updates/.hidden', '/updates/nothing.dmg', '/updates/downloads.json']) expect([path, (await fetch(site.origin + path)).status]).toEqual([path, 404])
    })

    it('puts the installers it lists on the download page, as they are released, without a restart', async () => {
        await site.close()
        const releases = join(dataDir, 'releases')
        mkdirSync(releases)
        await start({ releases })
        expect(await page('/download')).not.toContain('href="/download/macos"')
        writeFileSync(join(releases, 'Weft_0.1.0_aarch64.dmg'), Buffer.alloc(300 * 1024, 7))
        writeFileSync(join(releases, 'downloads.json'), JSON.stringify({ builds: [{ platform: 'macos', file: 'Weft_0.1.0_aarch64.dmg', version: '0.1.0' }, { platform: 'linux', file: '../site.json', version: '9' }, { platform: 'windows', file: 'missing.msi', version: '0.1.0' }] }))
        const html = await page('/download')
        expect(html).toContain('<span class="num">Version 0.1.0, 0.3 MB</span>')
        expect(html).toContain('<a class="btn go" href="/download/macos" aria-label="Download Weft for macOS">')
        expect(html).not.toContain('href="/download/linux"')
        expect(html).not.toContain('href="/download/windows"')
        const got = await fetch(`${site.origin}/download/macos`)
        expect([got.status, got.headers.get('content-disposition')]).toEqual([200, 'attachment; filename="Weft_0.1.0_aarch64.dmg"'])
        await got.arrayBuffer()
        expect((await fetch(`${site.origin}/download/linux`)).status).toBe(404)
    })
})

describe('every page', () => {
    it('leaves nothing a person typed as markup, in text or in an attribute', async () => {
        const token = await signIn('ante@example.com', '<b>')
        const first = await publish(token, { file: plain('Low <i>sun</i>') })
        const made = await publish(token, { file: song({ name: '<img src=x onerror=alert(1)>' }), description: '<script>alert(2)</script>', style: '"><i>', from: first.id })
        const paths = ['/', '/songs', '/songs?q="><i>', `/songs/${made.id}`, `/songs/${first.id}`]
        const bold: number[] = []
        for (const path of paths) {
            const html = await page(path)
            expect(html).not.toContain('<img src=x')
            expect(html).not.toContain('<script>')
            expect(html).not.toContain('"><i>')
            expect(html).not.toContain('<i>sun')
            expect(html).toContain('&#60;img src=x onerror=alert(1)&#62;')
            expect(html).toContain('&#60;b&#62;')
            bold.push(html.split('<b>').length)
        }
        const html = await page(`/songs/${made.id}`)
        expect(html).toContain('title="Songs tagged &#34;&#62;&#60;i&#62;"')
        expect(html).toContain('aria-label="Play the preview of &#60;img src=x onerror=alert(1)&#62;"')
        expect(html).toContain('<p class="about">&#60;script&#62;alert(2)&#60;/script&#62;</p>')
        expect(html).toContain('Reworked from <b>Low &#60;i&#62;sun&#60;/i&#62;</b> by &#60;b&#62;')
        expect(await page('/songs?q="><i>')).toContain('name="q" value="&#34;&#62;&#60;i&#62;"')
        const file = await fetch(`${site.origin}/songs/${made.id}.weft`)
        expect(file.headers.get('content-disposition')).toBe('attachment; filename="_img src_x onerror_alert_1_.weft"')
        // The pages have bold words of their own. With a plain name in place of <b> they have exactly as many.
        await ask('/api/me', { token, json: { name: 'Zed' } })
        for (const [at, path] of paths.entries()) expect([path, (await page(path)).split('<b>').length]).toEqual([path, bold[at]])
    })

    it('may load only what the site serves itself, has no script or style written into it, and is not cached', async () => {
        const made = await publish(await signIn(), { peaks: [0.2, 0.8], seconds: 30 })
        const reported = await send(`/songs/${made.id}/report`, { reason: 'Why not' })
        const answers = [...(await Promise.all(['/', '/songs', `/songs/${made.id}`, '/download', '/download/macos', '/licence', '/nothing/here'].map((path) => fetch(site.origin + path)))), reported]
        for (const answer of answers) {
            expect(answer.headers.get('content-security-policy')).toBe(RULES)
            expect(answer.headers.get('content-type')).toBe('text/html; charset=utf-8')
            expect(answer.headers.get('x-content-type-options')).toBe('nosniff')
            expect(answer.headers.get('referrer-policy')).toBe('no-referrer')
            expect(answer.headers.get('cache-control')).toBe('no-store')
            const html = await answer.text()
            expect(html).not.toMatch(/<style|style="|<script(?! src="\/site\.js" defer><\/script>)| on[a-z]+="/)
            expect(html).toContain('<link rel="stylesheet" href="/site.css">')
        }
    })

    it('knows nobody: no account, no cookie, nothing to sign in to', async () => {
        const token = await signIn()
        const made = await publish(token)
        for (const path of ['/', '/songs', `/songs/${made.id}`, '/download', '/licence']) {
            const answer = await fetch(site.origin + path, { headers: { Authorization: `Bearer ${token}`, Cookie: `weft=${token}` } })
            expect(answer.status).toBe(200)
            expect(answer.headers.get('set-cookie')).toBeNull()
            const html = await answer.text()
            expect(html).not.toMatch(/sign in|sign out|dashboard|password|ante@example\.com/i)
            expect(html).toMatch(/<nav class="nav" aria-label="Site">\s*<a href="\/songs" data-nav="songs">Songs<\/a>\s*<a href="\/download" data-nav="download">Download<\/a>\s*<\/nav>\s*<\/div>\s*<\/header>/)
        }
    })

    it('is gone where the site used to sign people in and keep their dashboard', async () => {
        const token = await signIn()
        const made = await publish(token)
        const gone = ['/sign-in', '/sign-in/confirm', '/sign-out', '/dashboard', '/dashboard/publish', `/dashboard/songs/${made.id}`, `/dashboard/songs/${made.id}/delete`, '/dashboard/profile', '/dashboard/jams', '/dashboard/account', '/password/forgot', '/password/new']
        for (const path of gone) {
            expect([path, (await fetch(site.origin + path, { headers: { Cookie: `weft=${token}` } })).status]).toEqual([path, 404])
            expect([path, (await send(path, { email: 'ante@example.com', password: 'a long enough one', form: token })).status]).toEqual([path, 404])
        }
        for (const path of ['/api/sign-in/poll', `/api/songs/${made.id}/preview`, '/api/dashboard']) expect([path, (await ask(path, { token, json: {} })).status]).toEqual([path, 404])
        expect((await send(`/dashboard/songs/${made.id}/delete`, {})).status).toBe(404)
        expect((await fetch(made.url)).status).toBe(200)
    })
})

describe('the files that are the same for everyone', () => {
    it('are the style sheet, the script, the picture and the fonts, and may be cached', async () => {
        const files = [
            ['/site.css', 'text/css; charset=utf-8', 'public, max-age=3600'],
            ['/site.js', 'text/javascript; charset=utf-8', 'public, max-age=3600'],
            ['/app-1.png', 'image/png', 'public, max-age=3600'],
            ['/app-2.png', 'image/png', 'public, max-age=3600'],
            ['/app-3.png', 'image/png', 'public, max-age=3600'],
            ['/fonts/archivo-latin-wdth-normal.woff2', 'font/woff2', 'public, max-age=2592000'],
            ['/fonts/martian-mono-latin-wdth-normal.woff2', 'font/woff2', 'public, max-age=2592000'],
            ['/fonts/piazzolla-latin-opsz-italic.woff2', 'font/woff2', 'public, max-age=2592000'],
        ]
        for (const [path, type, kept] of files) {
            const answer = await fetch(site.origin + path)
            expect([path, answer.status, answer.headers.get('content-type'), answer.headers.get('cache-control')]).toEqual([path, 200, type, kept])
            expect(answer.headers.get('x-content-type-options')).toBe('nosniff')
            expect((await answer.arrayBuffer()).byteLength).toBeGreaterThan(1000)
        }
        expect(Buffer.from(await (await fetch(`${site.origin}/app-1.png`)).arrayBuffer()).subarray(1, 4).toString()).toBe('PNG')
    })

    it('ask for every font the style sheet names, and each of them is there', async () => {
        const css = await page('/site.css')
        const named = [...css.matchAll(/url\((\/fonts\/[^)]+)\)/g)].map((found) => found[1])
        expect(named).toHaveLength(21)
        for (const path of named) expect([path, (await fetch(site.origin + path)).status]).toEqual([path, 200])
        expect(css).not.toMatch(/url\((?!\/fonts\/)/)
    })

    it('are nothing but those: no other file of the packages or of the project is handed out', async () => {
        const outside = [
            '/fonts/archivo-latin-wght-normal.woff2',
            '/fonts/archivo-latin-wdth-normal.woff',
            '/fonts/',
            '/fonts/..%2F..%2Fpackage.json',
            '/fonts/%2e%2e/%2e%2e/package.json',
            '/fonts/../site.css/../../package.json',
            '/assets/site.css',
            '/server/site.ts',
            '/site.ts',
            '/pages.ts',
            '/package.json',
            '/site.css/',
            '/SITE.CSS',
            '/.data/site.json',
            '/site.json',
        ]
        for (const path of outside) {
            const answer = await fetch(site.origin + path)
            expect([path, answer.status]).toEqual([path, 404])
            expect(await answer.text()).not.toContain('"dependencies"')
        }
        expect((await fetch(`${site.origin}/site.css`, { method: 'POST' })).status).toBe(404)
    })
})
