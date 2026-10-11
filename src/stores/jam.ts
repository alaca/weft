import { createSignal } from 'solid-js'
import type { OpenJam } from '../jam/protocol'

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

// The call inside a jam: whose microphone is on, how loud each is at this moment (0 to 1), and
// what there is to say when a microphone or the call itself does not work.
export const [jamMic, setJamMic] = createSignal(false)
export const [jamTheirMic, setJamTheirMic] = createSignal(false)
export const [jamLevels, setJamLevels] = createSignal<{ mine: number; theirs: number }>({ mine: 0, theirs: 0 })
export const [jamVoiceNote, setJamVoiceNote] = createSignal<string | null>(null)
// Whether this machine takes part in the call. It does once its person switched something on
// or chose to hear and see the other.
export const [jamCall, setJamCall] = createSignal(false)
// The pictures of the call: whose camera is on, and what each camera shows.
export const [jamCam, setJamCam] = createSignal(false)
export const [jamTheirCam, setJamTheirCam] = createSignal(false)
export const [jamPictures, setJamPictures] = createSignal<{ mine: MediaStream | null; theirs: MediaStream | null }>({ mine: null, theirs: null })

// Jams that anyone may ask to join. Yours is `jamListed` while you wait in it; `openJams` are
// those of others, null while the list cannot be read. `jamAsked` is the one you asked and have
// no answer from yet, `jamAsks` are the people who asked you, and `jamTurnedDown` are the jams
// that said not now.
export const [jamListed, setJamListed] = createSignal(false)
export const [jamOwn, setJamOwn] = createSignal<string | null>(null)
export const [openJams, setOpenJams] = createSignal<OpenJam[] | null>([])
export const [jamAsked, setJamAsked] = createSignal<{ id: string; name: string } | null>(null)
export const [jamAsks, setJamAsks] = createSignal<{ ask: string; name: string }[]>([])
export const [jamTurnedDown, setJamTurnedDown] = createSignal<string[]>([])

export const jamming = () => jamStage() === 'jamming'
