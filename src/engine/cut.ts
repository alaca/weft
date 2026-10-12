// A pattern cut in two at the beginning of a bar: only the notes that begin before the bar, or
// only the ones that begin at it or after. It is what a pattern is asked through when a scene
// switches it off or on a moment before the bar the scene comes in on.
//
// A stretch of time that lies wholly on the side that is cut away is answered without asking
// the pattern, so one that was switched off costs nothing from the bar on.
type Moment = { valueOf(): number }
type Asked = { span: { begin: Moment; end: Moment } }
type Note = { whole?: { begin: Moment }; part: { begin: Moment } }

export function cutAt<State extends Asked, Hap extends Note>(ask: (state: State) => Hap[], bar: number, keep: 'before' | 'from') {
    const before = keep === 'before'
    return (state: State): Hap[] => {
        if (before ? state.span.begin.valueOf() >= bar : state.span.end.valueOf() <= bar) return []
        return ask(state).filter((hap) => ((hap.whole ?? hap.part).begin.valueOf() < bar) === before)
    }
}
