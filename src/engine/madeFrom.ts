// A recording that starts later than the first bar is made from a little earlier, and that
// much is left out of it afterwards. What was begun before it starts is then in it: a sound
// that still rings, a level that is still pushed down. This answers the bar it is made from:
// `lead` bars before the one it starts at, and earlier still when a note that is heard in
// those bars or where it starts began before that. A long note that ends right where the
// recording starts is one of them: it still fades there. `begins` answers where the sounds
// heard in a bar began, in bars.
export function madeFrom(from: number, lead: number, begins: (bar: number) => number[]): number {
    if (from <= 0) return 0
    let first = from - lead
    for (let bar = Math.max(0, from - lead); bar <= from; bar++) {
        for (const begin of begins(bar)) first = Math.min(first, begin)
    }
    return Math.max(0, Math.floor(first))
}
