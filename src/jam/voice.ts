import type { Told } from './protocol'

// The call between the two people in a jam. Their voices and pictures go straight from one
// machine to the other; only the few messages that set the call up pass through the relay.
// Setting a call up tells the other machine where this one is on its network, so a machine
// takes part only once its person has asked for it, by switching something on or by choosing
// to hear the other. From then on a microphone or a camera is put into the call and taken out
// again without the call being made anew.
export type VoiceEvents = { tell(told: Told): void; levels(mine: number, theirs: number): void; picture(theirs: MediaStream): void; failed(): void }
export type Voice = { told(told: Told): void; speak(stream: MediaStream | null): Promise<void>; show(stream: MediaStream | null): Promise<void>; close(): void }

// A picture the size of a small tile needs no more than this to be sent.
const PICTURE_BITS = 350_000

const EVERY = 100
const LOUD = 4

// Who helps a call find its way: what the app was built with, until the site has said more.
function builtWith(): RTCIceServer[] {
    try {
        const given = JSON.parse(import.meta.env.VITE_JAM_ICE ?? '[]')
        return Array.isArray(given) ? given : []
    } catch {
        return []
    }
}
let helpers: RTCIceServer[] | null = null

// What the site says a call needs, taken only in the shape such a list has: addresses that
// begin with stun: or turn:, and for a carrier the pass that goes with them.
export function useHelpers(said: unknown) {
    const list = (said as { iceServers?: unknown } | null)?.iceServers
    if (!Array.isArray(list)) return
    const read: RTCIceServer[] = []
    for (const one of list as { urls?: unknown; username?: unknown; credential?: unknown }[]) {
        const urls = (Array.isArray(one?.urls) ? one.urls : [one?.urls]).filter((url): url is string => typeof url === 'string' && /^(stun|turns?):[A-Za-z0-9.:?=\-[\]]+$/.test(url))
        if (!urls.length) continue
        read.push(typeof one.username === 'string' && typeof one.credential === 'string' ? { urls, username: one.username, credential: one.credential } : { urls })
    }
    helpers = read.length ? read : null
}

// A window is only let to make sound after a click or a key, and a jam starts when the other
// person joins, which is neither. So what the call is heard through is made ready at the click
// that makes or uses the invite, and is running by the time there is a voice to hear.
let ready: AudioContext | null = null
export function primeVoice() {
    try {
        if (!ready || ready.state === 'closed') ready = new AudioContext()
        else if (ready.state !== 'running') void ready.resume().catch(() => undefined)
    } catch {
        ready = null
    }
}

export function openVoice(host: boolean, on: VoiceEvents): Voice | null {
    if (typeof RTCPeerConnection === 'undefined') return null
    const peer = new RTCPeerConnection({ iceServers: helpers ?? builtWith() })
    // Their voice is played through the same thing that measures it. Some browsers only let a
    // voice from a call flow at all while an audio element holds it, so one does, in silence.
    const ear = document.createElement('audio')
    ear.muted = true
    ear.hidden = true
    document.body.appendChild(ear)
    let context: AudioContext | null = ready && ready.state !== 'closed' ? ready : null
    ready = null
    let mine: AnalyserNode | null = null
    let theirs: AnalyserNode | null = null
    let sender: RTCRtpSender | null = null
    let eye: RTCRtpSender | null = null
    // What this person has switched on. The one who joined has nowhere to put it until the
    // offer of the call has arrived, so it is kept and put in then.
    let voiced: MediaStreamTrack | null = null
    let filmed: MediaStreamTrack | null = null
    let closed = false
    let described = false
    const early: RTCIceCandidateInit[] = []

    // A window is only let to make sound, or to measure it, after a click or a key. The jam
    // starts when the other person joins, which is neither, so both are tried again at the next.
    const wake = () => {
        if (context && context.state !== 'running') void context.resume().catch(() => undefined)
        if (ear.srcObject && ear.paused) void ear.play().catch(() => undefined)
    }
    const GESTURES = ['pointerdown', 'click', 'keydown'] as const
    for (const gesture of GESTURES) window.addEventListener(gesture, wake, true)

    const listen = (stream: MediaStream, aloud: boolean): AnalyserNode | null => {
        try {
            context ??= new AudioContext()
            const meter = context.createAnalyser()
            meter.fftSize = 512
            const source = context.createMediaStreamSource(stream)
            source.connect(meter)
            if (aloud) source.connect(context.destination)
            wake()
            return meter
        } catch {
            return null
        }
    }
    const samples = new Float32Array(512)
    const levelOf = (meter: AnalyserNode | null): number => {
        if (!meter) return 0
        meter.getFloatTimeDomainData(samples)
        let sum = 0
        for (const sample of samples) sum += sample * sample
        return Math.min(1, Math.sqrt(sum / samples.length) * LOUD)
    }
    const measuring = window.setInterval(() => on.levels(levelOf(mine), levelOf(theirs)), EVERY)

    peer.onicecandidate = (event) => on.tell({ k: 'ice', candidate: event.candidate ? event.candidate.toJSON() : null })
    peer.oniceconnectionstatechange = () => {
        if (!closed && peer.iceConnectionState === 'failed') on.failed()
    }
    peer.ontrack = (event) => {
        if (event.track.kind === 'video') return on.picture(new MediaStream([event.track]))
        const stream = new MediaStream([event.track])
        ear.srcObject = stream
        void ear.play().catch(() => undefined)
        theirs = listen(stream, true)
    }

    const settle = async () => {
        described = true
        for (const candidate of early.splice(0)) await peer.addIceCandidate(candidate).catch(() => undefined)
    }

    // The one who made the jam is the one who offers the call. The offer is made when their
    // side is ready, and made again when the other side says that it now is: an offer that
    // arrived there earlier was not taken up.
    const offer = (again: boolean) =>
        void peer
            .createOffer(again ? { iceRestart: true } : undefined)
            .then((made) => peer.setLocalDescription(made))
            .then(() => peer.localDescription && on.tell({ k: 'rtc', sdp: peer.localDescription.toJSON() }))
            .catch(() => on.failed())
    if (host) {
        sender = peer.addTransceiver('audio', { direction: 'sendrecv' }).sender
        eye = peer.addTransceiver('video', { direction: 'sendrecv' }).sender
        offer(false)
    } else {
        on.tell({ k: 'call' })
    }

    const answer = async (sdp: RTCSessionDescriptionInit) => {
        await peer.setRemoteDescription(sdp)
        if (sdp.type === 'offer') {
            for (const line of peer.getTransceivers()) {
                line.direction = 'sendrecv'
                if (line.receiver.track.kind === 'video') eye = line.sender
                else sender = line.sender
            }
            await sender?.replaceTrack(voiced)
            await eye?.replaceTrack(filmed)
            await peer.setLocalDescription(await peer.createAnswer())
            if (peer.localDescription) on.tell({ k: 'rtc', sdp: peer.localDescription.toJSON() })
        }
        await settle()
    }

    return {
        told(told) {
            if (closed) return
            if (told.k === 'call' && host) return offer(true)
            if (told.k === 'rtc' && told.sdp && (told.sdp.type === 'offer') !== host) void answer(told.sdp).catch(() => on.failed())
            if (told.k === 'ice' && told.candidate) {
                if (described) void peer.addIceCandidate(told.candidate).catch(() => undefined)
                else early.push(told.candidate)
            }
        },
        async speak(stream) {
            if (closed) return
            voiced = stream?.getAudioTracks()[0] ?? null
            mine = stream ? listen(stream, false) : null
            await sender?.replaceTrack(voiced)
        },
        async show(stream) {
            if (closed) return
            filmed = stream?.getVideoTracks()[0] ?? null
            if (!eye) return
            await eye.replaceTrack(filmed)
            if (!stream) return
            try {
                const sending = eye.getParameters()
                if (sending.encodings?.[0]) {
                    sending.encodings[0].maxBitrate = PICTURE_BITS
                    await eye.setParameters(sending)
                }
            } catch {
                return
            }
        },
        close() {
            closed = true
            window.clearInterval(measuring)
            for (const gesture of GESTURES) window.removeEventListener(gesture, wake, true)
            peer.close()
            ear.srcObject = null
            ear.remove()
            void context?.close().catch(() => undefined)
        },
    }
}
