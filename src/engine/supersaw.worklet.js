// The supersaw of superdough 1.3.0 (worklets.mjs, Strudel contributors, AGPL-3.0-or-later), kept
// line for line but for one thing: it never touches its message port. WebKit keeps every worklet
// node for as long as the audio context is open, and one whose code has opened its port goes on
// costing processor time and memory for good, so a song with a supersaw pattern got heavier with
// every note it had ever played. superdough tells its supersaw by a message that a new note
// begins. This one sees it by the note's new beginning.
const INVSR = 1 / sampleRate

const pv = (arr, n) => arr[n] ?? arr[0]
const frac = (x) => x - Math.floor(x)

const getDetuner = (unison, detune) => {
    if (unison < 2) return (_voiceIdx) => 0
    const scale = detune / (unison - 1)
    const center = detune * 0.5
    return (voiceIdx) => voiceIdx * scale - center
}

const applySemitoneDetuneToFrequency = (frequency, detune) => frequency * Math.pow(2, detune / 12)

function polyBlep(phase, dt) {
    dt = Math.min(dt, 1 - dt)
    const invdt = 1 / dt
    if (phase < dt) {
        phase *= invdt
        return 2 * phase - phase ** 2 - 1
    } else if (phase > 1 - dt) {
        phase = (phase - 1) * invdt
        return phase ** 2 + 2 * phase + 1
    }
    return 0
}

const sawblep = (phase, dt) => 2 * phase - 1 - polyBlep(phase, dt)

class Supersaw extends AudioWorkletProcessor {
    constructor() {
        super()
        this.phase = []
        this.begun = -1
    }
    static get parameterDescriptors() {
        return [
            { name: 'begin', defaultValue: -1, max: Number.POSITIVE_INFINITY, min: -1 },
            { name: 'end', defaultValue: -1, max: Number.POSITIVE_INFINITY, min: -1 },
            { name: 'frequency', defaultValue: 440, min: Number.EPSILON },
            { name: 'panspread', defaultValue: 0.4, min: 0, max: 1 },
            { name: 'freqspread', defaultValue: 0.2, min: 0 },
            { name: 'detune', defaultValue: 0, min: 0 },
            { name: 'voices', defaultValue: 5, min: 1, automationRate: 'k-rate' },
        ]
    }
    process(_input, outputs, params) {
        const begin = params.begin[0]
        const end = params.end[0]
        // A node is used again for a later note, which then starts its voices afresh.
        if (begin !== this.begun) {
            this.begun = begin
            this.phase = []
        }
        const beginDefined = begin >= 0
        const endDefined = end >= 0
        // Half a second after its end the node may still be taken for another note.
        const shouldTerminate = endDefined && currentTime >= end + 0.5
        const ended = endDefined && currentTime >= end
        const notStarted = currentTime <= begin
        if (shouldTerminate) return false
        if (ended || notStarted || !beginDefined) return true
        const output = outputs[0]
        const voices = params.voices[0]
        for (let i = 0; i < output[0].length; i++) {
            const detune = pv(params.detune, i)
            const freqspread = pv(params.freqspread, i)
            const panspread = pv(params.panspread, i) * 0.5 + 0.5
            let gainL = Math.sqrt(1 - panspread)
            let gainR = Math.sqrt(panspread)
            let freq = pv(params.frequency, i)
            freq = applySemitoneDetuneToFrequency(freq, detune / 100)
            const detuner = getDetuner(voices, freqspread)
            for (let n = 0; n < voices; n++) {
                const freqVoice = applySemitoneDetuneToFrequency(freq, detuner(n))
                const dt = frac(freqVoice * INVSR)
                this.phase[n] = this.phase[n] ?? Math.random()
                const v = sawblep(this.phase[n], dt)

                output[0][i] += v * gainL
                output[1][i] += v * gainR

                let pn = this.phase[n] + dt
                if (pn >= 1.0) pn -= 1.0
                this.phase[n] = pn
                const tmp = gainL
                gainL = gainR
                gainR = tmp
            }
        }
        return true
    }
}

registerProcessor('weft-supersaw', Supersaw)
