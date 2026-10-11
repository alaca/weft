import { createSignal } from 'solid-js'
import type { Me, Published, Refusal } from '../site/api'

// Publishing a song: `out` is not signed in, `mail` is waiting for the link to be pressed,
// `form` is ready to publish, `working` is on its way, `done` is published.
export type PublishStage = 'looking' | 'out' | 'mail' | 'form' | 'working' | 'done'

export const [publishOpen, setPublishOpen] = createSignal(false)
export const [publishStage, setPublishStage] = createSignal<PublishStage>('looking')
export const [publishMe, setPublishMe] = createSignal<Me | null>(null)
export const [publishMine, setPublishMine] = createSignal<Published[]>([])
export const [publishNote, setPublishNote] = createSignal<string | null>(null)
export const [publishRefused, setPublishRefused] = createSignal<Refusal | null>(null)
// What the song's file would be: how large, and at what quality its sounds had to be made MP3.
export const [publishFacts, setPublishFacts] = createSignal<{ bytes: number; kbps: number | null } | null>(null)
export const [publishMail, setPublishMail] = createSignal<{ email: string; link: string | null } | null>(null)
export const [publishDone, setPublishDone] = createSignal<Published | null>(null)
export const [publishFrom, setPublishFrom] = createSignal(0)
