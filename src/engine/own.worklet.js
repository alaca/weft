// Six of superdough 1.3.0's processors (worklets.mjs and helpers.mjs, Strudel contributors,
// AGPL-3.0-or-later), kept to the same sums so that they give the same samples, and changed only
// in what costs WebKit dearly.
//
// The supersaw never touches its message port. WebKit keeps every worklet node for as long as
// the audio context is open, and one whose code has opened its port goes on costing processor
// time and memory for good, so a song with a supersaw pattern got heavier with every note it
// had ever played. superdough tells its supersaw by a message that a new note begins. This one
// sees it by the note's new beginning.
//
// Crush and distortion take each channel's samples as one array for a whole block, where
// superdough's look the array up again for every sample. In WebKit that look-up is slow, and a
// song with many such effects took more than twice as long to make into a file.
//
// The four effects and the LFO can be kept: such a one goes on after its note has ended, so that
// the node can be given to the next note that wants the same (see unplug.ts).
const blockSize = 128
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

const clamp = (num, min, max) => Math.min(Math.max(num, min), max)

class Crush extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [{ name: 'crush', defaultValue: 0 }]
    }
    constructor(options) {
        super()
        this.started = false
        this.kept = Boolean(options?.processorOptions?.kept)
    }
    process(inputs, outputs, parameters) {
        const input = inputs[0]
        const output = outputs[0]
        if (input[0] === undefined) return this.kept || !this.started
        this.started = true
        const x = Math.pow(2, Math.max(1, parameters.crush[0] ?? 8) - 1)
        for (let i = 0; i < input.length; i++) {
            const from = input[i]
            const to = output[i]
            for (let n = 0; n < blockSize; n++) to[n] = Math.round(from[n] * x) / x
        }
        return true
    }
}

registerProcessor('weft-crush', Crush)

const squash = (x) => x / (1 + x)
const mod = (n, m) => ((n % m) + m) % m
const scurve = (x, k) => ((1 + k) * x) / (1 + k * Math.abs(x))
const soft = (x, k) => Math.tanh(x * (1 + k))
const hard = (x, k) => clamp((1 + k) * x, -1, 1)
const fold = (x, k) => 1 - Math.abs(mod((1 + 0.5 * k) * x + 1, 4) - 2)
const sineFold = (x, k) => Math.sin((Math.PI / 2) * fold(x, k))
const cubic = (x, k) => {
    const t = squash(Math.log1p(k))
    return soft((x - (t / 3) * x * x * x) / (1 - t / 3), k)
}
const diode = (x, k, asym = false) => {
    const g = 1 + 2 * k
    const t = squash(Math.log1p(k))
    const bias = 0.07 * t
    const pos = soft(x + bias, 2 * k)
    const neg = soft(asym ? bias : -x + bias, 2 * k)
    const y = pos - neg
    const sech = 1 / Math.cosh(g * bias)
    const sech2 = sech * sech
    const denom = Math.max(1e-8, (asym ? 1 : 2) * g * sech2)
    return soft(y / denom, k)
}
const asym = (x, k) => diode(x, k, true)
const chebyshev = (x, k) => {
    const kl = 10 * Math.log1p(k)
    let tnm1 = 1
    let tnm2 = x
    let tn
    let y = 0
    for (let i = 1; i < 64; i++) {
        if (i < 2) {
            y += i == 0 ? tnm1 : tnm2
            continue
        }
        tn = 2 * x * tnm1 - tnm2
        tnm2 = tnm1
        tnm1 = tn
        if (i % 2 === 0) y += Math.min((1.3 * kl) / i, 2) * tn
    }
    return soft(y, kl / 20)
}

// In the order superdough has them: a number picks by its place, going round past the last.
const ALGORITHMS = { scurve, soft, hard, cubic, diode, asym, fold, sinefold: sineFold, chebyshev }
const NAMES = Object.keys(ALGORITHMS)
const algorithmOf = (asked) => {
    const index = typeof asked === 'string' ? Math.max(0, NAMES.indexOf(asked)) : asked
    return ALGORITHMS[NAMES[index % NAMES.length]]
}

class Distort extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'distort', defaultValue: 0 },
            { name: 'postgain', defaultValue: 1 },
        ]
    }
    constructor({ processorOptions }) {
        super()
        this.started = false
        this.kept = Boolean(processorOptions.kept)
        this.algorithm = algorithmOf(processorOptions.algorithm)
    }
    process(inputs, outputs, parameters) {
        const input = inputs[0]
        const output = outputs[0]
        if (input[0] === undefined) return this.kept || !this.started
        this.started = true
        const algorithm = this.algorithm
        const gains = parameters.postgain
        const drives = parameters.distort
        for (let ch = 0; ch < input.length; ch++) {
            const from = input[ch]
            const to = output[ch]
            for (let n = 0; n < blockSize; n++) to[n] = clamp(pv(gains, n), 0.001, 1) * algorithm(from[n], Math.expm1(pv(drives, n)))
        }
        return true
    }
}

registerProcessor('weft-distort', Distort)

class Coarse extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [{ name: 'coarse', defaultValue: 1 }]
    }
    constructor(options) {
        super()
        this.started = false
        this.kept = Boolean(options?.processorOptions?.kept)
    }
    process(inputs, outputs, parameters) {
        const input = inputs[0]
        const output = outputs[0]
        if (input[0] === undefined) return this.kept || !this.started
        this.started = true
        const coarse = Math.max(1, parameters.coarse[0] ?? 0)
        for (let i = 0; i < input.length; i++) {
            const from = input[i]
            const to = output[i]
            for (let n = 0; n < blockSize; n++) to[n] = n % coarse === 0 ? from[n] : to[n - 1]
        }
        return true
    }
}

registerProcessor('weft-coarse', Coarse)

class Shape extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'shape', defaultValue: 0 },
            { name: 'postgain', defaultValue: 1 },
        ]
    }
    constructor(options) {
        super()
        this.started = false
        this.kept = Boolean(options?.processorOptions?.kept)
    }
    process(inputs, outputs, parameters) {
        const input = inputs[0]
        const output = outputs[0]
        if (input[0] === undefined) return this.kept || !this.started
        this.started = true
        let shape = parameters.shape[0]
        shape = shape < 1 ? shape : 1.0 - 4e-10
        shape = (2.0 * shape) / (1.0 - shape)
        const postgain = Math.max(0.001, Math.min(1, parameters.postgain[0]))
        for (let i = 0; i < input.length; i++) {
            const from = input[i]
            const to = output[i]
            for (let n = 0; n < blockSize; n++) to[n] = (((1 + shape) * from[n]) / (1 + shape * Math.abs(from[n]))) * postgain
        }
        return true
    }
}

registerProcessor('weft-shape', Shape)

const TWO_PI = 2 * Math.PI
const ffrac = (x) => x - (x | 0)

// In the order superdough has them: a shape is asked for by its place.
const SHAPES = {
    tri(phase, skew = 0.5) {
        const x = 1 - skew
        if (phase >= skew) return 1 / x - phase / x
        return phase / skew
    },
    sine: (phase) => Math.sin(TWO_PI * phase) * 0.5 + 0.5,
    ramp: (phase) => phase,
    saw: (phase) => 1 - phase,
    square: (phase, skew = 0.5) => (phase >= skew ? 0 : 1),
    custom(phase, values = [0, 1]) {
        const numParts = values.length - 1
        const currPart = Math.floor(phase * numParts)
        const partLength = 1 / numParts
        const startVal = clamp(values[currPart], 0, 1)
        const endVal = clamp(values[currPart + 1], 0, 1)
        return ((endVal - startVal) / partLength) * (phase - partLength * currPart) + startVal
    },
    sawblep: (phase, dt) => 2 * phase - 1 - polyBlep(phase, dt),
}
const SHAPE_NAMES = Object.keys(SHAPES)

const silence = (output) => {
    for (const channel of output) channel.fill(0)
}

// A kept LFO sees that it has been given its next note by the note's new beginning, and starts
// its wave afresh.
class Lfo extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'begin', defaultValue: 0 },
            { name: 'time', defaultValue: 0 },
            { name: 'end', defaultValue: 0 },
            { name: 'frequency', defaultValue: 0.5 },
            { name: 'skew', defaultValue: 0.5 },
            { name: 'depth', defaultValue: 1 },
            { name: 'phaseoffset', defaultValue: 0 },
            { name: 'shape', defaultValue: 0 },
            { name: 'curve', defaultValue: 1 },
            { name: 'dcoffset', defaultValue: 0 },
            { name: 'min', defaultValue: -1e9 },
            { name: 'max', defaultValue: 1e9 },
        ]
    }
    constructor(options) {
        super()
        this.phase = undefined
        this.begun = undefined
        this.kept = Boolean(options?.processorOptions?.kept)
    }
    process(_inputs, outputs, parameters) {
        const begin = parameters.begin[0]
        const end = parameters.end[0]
        const output = outputs[0]
        if (begin !== this.begun) {
            this.begun = begin
            this.phase = undefined
        }
        if (currentTime >= end) {
            if (!this.kept) return false
            silence(output)
            return true
        }
        if (currentTime <= begin) {
            if (this.kept) silence(output)
            return true
        }
        const frequency = parameters.frequency[0]
        const time = parameters.time[0]
        const depth = parameters.depth[0]
        const skew = parameters.skew[0]
        const phaseoffset = parameters.phaseoffset[0]
        const curve = parameters.curve[0]
        const dcoffset = parameters.dcoffset[0]
        const min = parameters.min[0]
        const max = parameters.max[0]
        const shape = SHAPES[SHAPE_NAMES[parameters.shape[0]]]
        const length = output[0].length ?? 0
        if (this.phase == null) this.phase = ffrac(time * frequency + phaseoffset)
        const dt = frequency * INVSR
        for (let n = 0; n < length; n++) {
            for (let i = 0; i < output.length; i++) output[i][n] = clamp(Math.pow((shape(this.phase, skew) + dcoffset) * depth, curve), min, max)
            this.phase += dt
            if (this.phase > 1.0) this.phase = this.phase - 1
        }
        return true
    }
}

registerProcessor('weft-lfo', Lfo)
