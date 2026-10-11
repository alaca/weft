import { createSignal } from 'solid-js'

// A jam is two people on one song. `calling` and `joining` are the moments before the relay has
// answered, `waiting` is an invite that nobody has used yet.
export type JamStage = 'idle' | 'calling' | 'waiting' | 'joining' | 'jamming'
export type JamLine = { kind: 'said'; mine: boolean; who: string; text: string } | { kind: 'event'; text: string }

export const [jamsOpen, setJamsOpen] = createSignal(false)
// How much of the left column the sounds take when the jam is shown under them. Null is the usual.
export const [soundsShare, setSoundsShare] = createSignal<number | null>(null)
export const [jamStage, setJamStage] = createSignal<JamStage>('idle')
export const [jamName, setJamName] = createSignal('')
export const [jamInvite, setJamInvite] = createSignal<string | null>(null)
export const [jamPeer, setJamPeer] = createSignal<string | null>(null)
export const [jamLines, setJamLines] = createSignal<JamLine[]>([])
export const [jamNote, setJamNote] = createSignal<string | null>(null)
// The pattern the other person changed last, for a little while after they did.
export const [jamHand, setJamHand] = createSignal<string | null>(null)

// What the other person said while the jam was not in sight.
export const [jamUnread, setJamUnread] = createSignal(0)

export const jamming = () => jamStage() === 'jamming'
