// The sums that turn the numbers of a ZZFX sound into its samples: buildSamples of superdough
// 1.3.0 (zzfx_fork.mjs, after ZzFX by Frank Force), kept to the same sums so that it gives the
// same samples. The one difference is that the rate is handed in, where superdough's asks the
// audio clock for it: a worker has no audio clock, and a worker is where this is run, so that a
// long note is not worked out on the thread the song is timed on.
export function buildSamples(params: number[], sampleRate: number): number[] {
    let [volume = 1, randomness = 0.05, frequency = 220, attack = 0, sustain = 0, release = 0.1, shape = 0, shapeCurve = 1, slide = 0, deltaSlide = 0, pitchJump = 0, pitchJumpTime = 0, repeatTime = 0, noise = 0, modulation = 0, bitCrush = 0, delay = 0, sustainVolume = 1, decay = 0, tremolo = 0] = params
    const PI2 = Math.PI * 2
    const sign = (v: number) => (v > 0 ? 1 : -1)
    const startSlide = (slide *= (500 * PI2) / sampleRate / sampleRate)
    let startFrequency = (frequency *= ((1 + randomness * 2 * Math.random() - randomness) * PI2) / sampleRate)
    const b: number[] = []
    let t = 0
    let tm = 0
    let i = 0
    let j = 1
    let r = 0
    let c = 0
    let s = 0
    let f
    let length

    attack = attack * sampleRate + 9
    decay *= sampleRate
    sustain *= sampleRate
    release *= sampleRate
    delay *= sampleRate
    deltaSlide *= (500 * PI2) / sampleRate ** 3
    modulation *= PI2 / sampleRate
    pitchJump *= PI2 / sampleRate
    pitchJumpTime *= sampleRate
    repeatTime = (repeatTime * sampleRate) | 0

    for (length = (attack + decay + sustain + release + delay) | 0; i < length; b[i++] = s) {
        if (!(++c % ((bitCrush * 100) | 0))) {
            s = shape ? (shape > 1 ? (shape > 2 ? (shape > 3 ? Math.sin((t % PI2) ** 3) : Math.max(Math.min(Math.tan(t), 1), -1)) : 1 - (((((2 * t) / PI2) % 2) + 2) % 2)) : 1 - 4 * Math.abs(Math.round(t / PI2) - t / PI2)) : Math.sin(t)

            s =
                (repeatTime ? 1 - tremolo + tremolo * Math.sin((PI2 * i) / repeatTime) : 1) *
                sign(s) *
                Math.abs(s) ** shapeCurve *
                volume *
                1 *
                (i < attack ? i / attack : i < attack + decay ? 1 - ((i - attack) / decay) * (1 - sustainVolume) : i < attack + decay + sustain ? sustainVolume : i < length - delay ? ((length - i - delay) / release) * sustainVolume : 0)

            s = delay ? s / 2 + (delay > i ? 0 : ((i < length - delay ? 1 : (length - i) / delay) * b[(i - delay) | 0]) / 2) : s
        }

        f = (frequency += slide += deltaSlide) * Math.cos(modulation * tm++)
        t += f - f * noise * (1 - (((Math.sin(i) + 1) * 1e9) % 2))

        if (j && ++j > pitchJumpTime) {
            frequency += pitchJump
            startFrequency += pitchJump
            j = 0
        }

        if (repeatTime && !(++r % repeatTime)) {
            frequency = startFrequency
            slide = startSlide
            j ||= 1
        }
    }

    return b
}
