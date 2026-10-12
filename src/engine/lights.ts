// While a song plays, Strudel lights the notes that sound in the code, and draws the pictures
// that stand in it. To know which notes those are it asks the whole song on every frame, with
// the code out of sight too, and for a long song that question is most of what the window does.
// Strudel's clock hands every note over a moment before it sounds, so the notes are taken from
// there instead: a frame only looks through the few that were handed over and have not ended.
// What comes back is called with every note that is handed over.

// With no frame drawn, as in a window that is put away, nothing looks through the notes that
// are kept. Past this many they are looked through as one more is handed over.
const MOST = 400

export function lightNotes(mirror: any, root: HTMLElement): (hap: any) => void {
    const drawer = mirror?.drawer
    const scheduler = mirror?.repl?.scheduler
    // All of this is Strudel's own insides. In a Strudel that is made another way they are left
    // alone, and it lights the notes as it always did.
    const known =
        typeof drawer?.framer?.onFrame === 'function' &&
        typeof drawer.invalidate === 'function' &&
        Array.isArray(drawer.visibleHaps) &&
        Array.isArray(drawer.painters) &&
        Array.isArray(drawer.drawTime) &&
        typeof mirror.highlight === 'function' &&
        typeof mirror.onDraw === 'function' &&
        typeof scheduler?.now === 'function' &&
        typeof scheduler.lastEnd === 'number'
    if (!known) return () => undefined

    let shown = true
    // A picture can be drawn over the whole window, where it stays in sight when the code does
    // not. So there is nothing to do only when the code is out of sight and no picture is drawn.
    const idle = () => !shown && !drawer.painters.length
    let lit: any[] | null = null
    let most = MOST
    let owed: [number, number] | null = null
    const notEnded = (time: number) => (hap: any) => hap.whole && hap.endClipped >= time

    drawer.framer.onFrame = () => {
        if (idle()) return
        const time: number = scheduler.now()
        let held: any[] = drawer.visibleHaps
        if (owed) {
            const [from, to] = owed
            owed = null
            held = held.concat(scheduler.pattern.queryArc(from, to).filter((hap: any) => hap.hasOnset()))
        }
        const kept = held.filter(notEnded(time))
        drawer.visibleHaps = kept
        const sounding = kept.filter((hap) => hap.whole.begin <= time)
        // The editor is only told when other notes sound than the ones it was told of last.
        if (shown && (!lit || lit.length !== sounding.length || sounding.some((hap, at) => hap !== lit![at]))) {
            lit = sounding
            mirror.highlight(sounding, time)
        }
        // Weft has Strudel draw the present moment only, so a picture is given the same notes.
        if (drawer.painters.length) mirror.onDraw(sounding, time, drawer.painters)
    }

    // After the code is played again Strudel asks the song once, for the tenth of a bar that
    // comes next. The clock is further on than that: it has handed over the notes up to where
    // it stands and will not hand them over again. Those are owed one more question, and the
    // next frame asks it, so that playing the code again takes no longer than it did.
    const ask = drawer.invalidate.bind(drawer)
    drawer.invalidate = (from: any = drawer.scheduler, t?: number) => {
        if (!from) return
        const at: number = t ?? from.now()
        ask(from, at)
        lit = null
        const asked = Math.max(at + drawer.drawTime[1] + 0.1, 0)
        owed = !idle() && from.lastEnd > asked ? [asked, from.lastEnd] : null
        if (idle()) drawer.visibleHaps = []
    }

    // The code is out of sight when only the controls are shown. Nothing is lit then, and
    // nothing kept unless a picture is drawn. When the code comes back the song is asked what
    // sounds at that moment.
    if (typeof IntersectionObserver !== 'undefined') {
        new IntersectionObserver((entries) => {
            const now = entries[entries.length - 1].isIntersecting
            if (now === shown) return
            shown = now
            if (!shown || !scheduler.started) return
            drawer.visibleHaps = []
            drawer.invalidate()
        }).observe(root)
    }

    return (hap) => {
        if (idle()) return
        // The sound engine writes into the note it is handed, among other things its length in
        // seconds where Strudel reads a length in bars. The note is kept as it was before that.
        const value = hap.value
        drawer.visibleHaps.push(value && typeof value === 'object' ? hap.withValue(() => ({ ...value })) : hap)
        if (drawer.visibleHaps.length <= most) return
        drawer.visibleHaps = drawer.visibleHaps.filter(notEnded(scheduler.now()))
        most = Math.max(MOST, drawer.visibleHaps.length * 2)
    }
}
