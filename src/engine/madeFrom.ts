// A recording that starts later than the first bar is made from a little earlier, and that
// much is left out of it afterwards. What was begun before it starts is then in it: a sound
// that still rings, a level that is still pushed down. This answers the bar it is made from:
// `lead` bars before the one it starts at, and earlier still when a note that is heard where
// it starts began before that. `begins` answers where the sounds heard in a bar began, in bars.
export function madeFrom(from: number, lead: number, begins: (bar: number) => number[]): number {
    if (from <= 0) return 0
    return Math.max(0, Math.floor(begins(from).reduce((first, begin) => Math.min(first, begin), from - lead)))
}
