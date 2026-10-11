import { createSignal } from 'solid-js'
import type { Me, Published } from '../site/api'

// Your account on the site, as far as the app knows it: who you are (null when signed out),
// the songs you have published, and what there is to say when something did not work.
export const [accountOpen, setAccountOpen] = createSignal(false)
export const [me, setMe] = createSignal<Me | null>(null)
export const [mySongs, setMySongs] = createSignal<Published[]>([])
export const [accountNote, setAccountNote] = createSignal<string | null>(null)
export const [accountBusy, setAccountBusy] = createSignal(false)
// A new password was asked for: the address, and the code itself when the site sends no mail.
export const [forgotFor, setForgotFor] = createSignal<{ email: string; code: string | null } | null>(null)
