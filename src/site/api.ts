// The app's side of the site that songs are published to. Signing in is by a link sent to an
// address; what the site hands back for it is kept in this app and sent along from then on.
export type Me = { name: string; email: string; used: number; most: number }
export type Refusal = { why: string; what: string; line?: number }
export type Published = { id: string; name: string; url: string; hidden: boolean; published: number }
export type Asked = { id: string; secret: string; link?: string }
export type Polled = { state: 'waiting' } | { state: 'gone' } | { state: 'done'; token: string; name: string; email: string }
export type ToPublish = { file: string; preview: string; description: string; style: string; licence: string; previewFrom: number }

export const SITE: string = import.meta.env.VITE_SITE ?? 'http://127.0.0.1:5191'
export const LICENCES = [
    { id: 'CC BY 4.0', about: 'They may rework it and share what they make, as long as they credit you.' },
    { id: 'CC BY-SA 4.0', about: 'The same, and what they make must carry this licence too.' },
    { id: 'CC0', about: 'No conditions. Nobody has to credit you.' },
] as const

const KEY = 'weft.session'

export class SiteRefused extends Error {
    constructor(
        readonly status: number,
        readonly refusal: Refusal,
    ) {
        super(refusal.what)
    }
}

async function call<T>(path: string, given: { method?: string; json?: unknown; token?: string | null } = {}): Promise<T> {
    let answer: Response
    try {
        answer = await fetch(SITE + path, {
            method: given.method ?? (given.json === undefined ? 'GET' : 'POST'),
            headers: { ...(given.json === undefined ? {} : { 'Content-Type': 'application/json' }), ...(given.token ? { Authorization: `Bearer ${given.token}` } : {}) },
            ...(given.json === undefined ? {} : { body: JSON.stringify(given.json) }),
        })
    } catch {
        throw new SiteRefused(0, { why: 'unreachable', what: 'The site could not be reached. Check that you are online, then try again.' })
    }
    const body = await answer.json().catch(() => ({}))
    if (!answer.ok) throw new SiteRefused(answer.status, { why: String(body?.why ?? 'site'), what: String(body?.what ?? 'The site could not do that just now.'), ...(typeof body?.line === 'number' ? { line: body.line } : {}) })
    return body as T
}

export const session = {
    get: (): string | null => localStorage.getItem(KEY),
    set: (token: string) => localStorage.setItem(KEY, token),
    clear: () => localStorage.removeItem(KEY),
}

export const site = {
    askLink: (email: string, name: string) => call<Asked>('/api/sign-in', { json: { email, name } }),
    poll: (id: string, secret: string) => call<Polled>('/api/sign-in/poll', { json: { id, secret } }),
    me: (token: string) => call<Me>('/api/me', { token }),
    mine: (token: string) => call<{ songs: Published[]; used: number; most: number }>('/api/songs?mine', { token }),
    publish: (token: string, song: ToPublish) => call<Published>('/api/songs', { token, json: song }),
    remove: (token: string, id: string) => call<{ used: number; most: number }>(`/api/songs/${id}`, { token, method: 'DELETE' }),
    signOut: (token: string) => call<object>('/api/sign-out', { token, method: 'POST' }),
}
