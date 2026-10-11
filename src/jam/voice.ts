import type { Told } from './protocol'

// The call between the two people in a jam. Their voices go straight from one machine to the
// other; only the few messages that set the call up pass through the relay. The call is there
// from the start of a jam with nothing in it, and a microphone is put into it and taken out
// again without the call being made anew.
export type VoiceEvents = { tell(told: Told): void; levels(mine: number, theirs: number): void; failed(): void }
export type Voice = { told(told: Told): void; speak(stream: MediaStream | null): Promise<void>; close(): void }

const EVERY = 100
const LOUD = 4

function iceServers(): RTCIceServer[] {
    try {
        const given = JSON.parse(import.meta.env.VITE_JAM_ICE ?? '[]')
        return Array.isArray(given) ? given : []
    } catch {
        return []
    }
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
    const peer = new RTCPeerConnection({ iceServers: iceServers() })
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
        const stream = event.streams[0] ?? new MediaStream([event.track])
        ear.srcObject = stream
        void ear.play().catch(() => undefined)
        theirs = listen(stream, true)
    }

    const settle = async () => {
        described = true
        for (const candidate of early.splice(0)) await peer.addIceCandidate(candidate).catch(() => undefined)
    }

    if (host) {
        sender = peer.addTransceiver('audio', { direction: 'sendrecv' }).sender
        void peer
            .createOffer()
            .then((offer) => peer.setLocalDescription(offer))
            .then(() => peer.localDescription && on.tell({ k: 'rtc', sdp: peer.localDescription.toJSON() }))
            .catch(() => on.failed())
    }

    const answer = async (sdp: RTCSessionDescriptionInit) => {
        await peer.setRemoteDescription(sdp)
        if (sdp.type === 'offer') {
            const line = peer.getTransceivers()[0]
            if (line) {
                line.direction = 'sendrecv'
                sender = line.sender
            }
            await peer.setLocalDescription(await peer.createAnswer())
            if (peer.localDescription) on.tell({ k: 'rtc', sdp: peer.localDescription.toJSON() })
        }
        await settle()
    }

    return {
        told(told) {
            if (closed) return
            if (told.k === 'rtc' && told.sdp && (told.sdp.type === 'offer') !== host) void answer(told.sdp).catch(() => on.failed())
            if (told.k === 'ice' && told.candidate) {
                if (described) void peer.addIceCandidate(told.candidate).catch(() => undefined)
                else early.push(told.candidate)
            }
        },
        async speak(stream) {
            if (closed || !sender) return
            await sender.replaceTrack(stream?.getAudioTracks()[0] ?? null)
            mine = stream ? listen(stream, false) : null
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
