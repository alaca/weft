// The app's side of the site that songs are published to. An account is an address and a
// password, made here in the app; the site itself has no sign-in. What the site hands back for
// signing in is kept in this app and sent along from then on, so a person signs in once.
export type Me = { name: string; email: string; used: number; most: number }
export type Refusal = { why: string; what: string; line?: number }
export type Published = { id: string; name: string; description: string; style: string; licence: string; hidden: boolean; published: number; plays: number; downloads: number; bytes: number; url: string }
// A song as the site's public list gives it.
export type SiteSong = Published & { by: string; tempo: number | null; patterns: string[]; preview: string; seconds?: number }
export type Signed = { token: string; name: string; email: string }
export type SongWords = { description: string; style: string; licence: string }
export type ToPublish = SongWords & { file: string; preview: string; peaks: number[]; seconds: number; previewFrom: number; from?: string }

export const SITE: string = import.meta.env.VITE_SITE ?? 'http://127.0.0.1:5191'
export const LICENCES = [
    { id: 'CC BY 4.0', about: 'They may rework it and share what they make, as long as they credit you.' },
    { id: 'CC BY-SA 4.0', about: 'The same, and what they make must carry this licence too.' },
    { id: 'CC0', about: 'No conditions. Nobody has to credit you.' },
] as const

const KEY = 'weft.session'
const ADDRESS = 'weft.account'
export const PASSWORD_LEAST = 8

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

// The address last signed in with, so that it does not have to be typed again.
export const account = {
    get: (): string => localStorage.getItem(ADDRESS) ?? '',
    set: (email: string) => localStorage.setItem(ADDRESS, email),
}

export const site = {
    register: (email: string, password: string, name: string) => call<Signed>('/api/register', { json: { email, password, name } }),
    signIn: (email: string, password: string) => call<Signed>('/api/sign-in', { json: { email, password } }),
    signOut: (token: string) => call<object>('/api/sign-out', { token, method: 'POST' }),
    forgot: (email: string) => call<{ code?: string }>('/api/password/forgot', { json: { email } }),
    reset: (email: string, code: string, password: string) => call<Signed>('/api/password/reset', { json: { email, code, password } }),
    password: (token: string, old: string, next: string) => call<object>('/api/password', { token, json: { old, new: next } }),
    me: (token: string) => call<Me>('/api/me', { token }),
    rename: (token: string, name: string) => call<Me>('/api/me', { token, json: { name } }),
    removeAccount: (token: string, password: string) => call<object>('/api/me', { token, method: 'DELETE', json: { password } }),
    songs: () => call<{ songs: SiteSong[] }>('/api/songs'),
    mine: (token: string) => call<{ songs: Published[]; used: number; most: number }>('/api/songs?mine', { token }),
    publish: (token: string, song: ToPublish) => call<Published>('/api/songs', { token, json: song }),
    edit: (token: string, id: string, words: SongWords) => call<Published>(`/api/songs/${id}`, { token, json: words }),
    hide: (token: string, id: string, hidden: boolean) => call<object>(`/api/songs/${id}/${hidden ? 'hide' : 'show'}`, { token, method: 'POST' }),
    remove: (token: string, id: string) => call<{ used: number; most: number }>(`/api/songs/${id}`, { token, method: 'DELETE' }),
}
