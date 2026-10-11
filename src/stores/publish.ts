import { createSignal } from 'solid-js'
import type { Published, Refusal } from '../site/api'

// Publishing a song: `looking` is asking the site who is signed in, `form` is the window as it
// is used (it asks for an account first when nobody is signed in), `working` is on its way,
// `done` is published.
export type PublishStage = 'looking' | 'form' | 'working' | 'done'

export const [publishOpen, setPublishOpen] = createSignal(false)
export const [publishStage, setPublishStage] = createSignal<PublishStage>('looking')
export const [publishNote, setPublishNote] = createSignal<string | null>(null)
export const [publishRefused, setPublishRefused] = createSignal<Refusal | null>(null)
// What the song's file would be: how large, and at what quality its sounds had to be made MP3.
export const [publishFacts, setPublishFacts] = createSignal<{ bytes: number; kbps: number | null } | null>(null)
export const [publishDone, setPublishDone] = createSignal<Published | null>(null)
export const [publishFrom, setPublishFrom] = createSignal(0)
