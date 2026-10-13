// A song that is made into a file is asked for its sounds a bar at a time, shortly before they
// are due. Asked for all of them at once, a long song holds the window still for more than a
// second before the first of it is made. `inBar` answers the sounds that start in one bar,
// `startOf` when a sound starts, in seconds. What comes back is asked with a time and answers
// the sounds that start before it and were not given yet, in the order they start in, and two
// that start together in the order they were answered in.
// Where the tempo changes along the song, when a bar starts is given in place of how many bars
// go by in a second.
export function barByBar<T>(bars: number, barsPerSecond: number | ((bar: number) => number), inBar: (bar: number) => T[], startOf: (sound: T) => number): (until: number) => T[] {
    const startOfBar = typeof barsPerSecond === 'function' ? barsPerSecond : (bar: number) => bar / barsPerSecond
    const waiting: T[] = []
    let asked = 0
    return (until) => {
        for (; asked < bars && startOfBar(asked) < until; asked++) {
            for (const sound of inBar(asked).sort((a, b) => startOf(a) - startOf(b))) waiting.push(sound)
        }
        let due = 0
        while (due < waiting.length && startOf(waiting[due]) < until) due++
        return waiting.splice(0, due)
    }
}
