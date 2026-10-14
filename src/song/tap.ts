// A tempo tapped in time: from the gaps between the last taps, once there are two. A pause of
// two seconds starts a new run of taps.
const GAP = 2000
const KEPT = 8

export function tapped(taps: number[], now: number): { taps: number[]; bpm: number | null } {
    const last = taps[taps.length - 1]
    const run = last !== undefined && now - last < GAP && now > last ? [...taps, now].slice(-KEPT) : [now]
    if (run.length < 2) return { taps: run, bpm: null }
    const gap = (run[run.length - 1] - run[0]) / (run.length - 1)
    return { taps: run, bpm: Math.round(Math.min(300, Math.max(20, 60000 / gap))) }
}
