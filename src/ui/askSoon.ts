// Asking a pattern what it plays is work on the thread the song is timed on. A row of the Song
// panel asks a pattern with versions about many more bars than one without, which for a busy
// one takes long. And at every new bar each playing strip asks about that bar. Done in one go,
// either is heard as the song stumbling. So the asking is done a few milliseconds at a time,
// with room for the song between, and a picture follows when all it needs has been asked.
const ASK_FOR = 5

// Who is asked for first. A strip asks one thing and is drawn as late as it has to wait, so one
// in sight goes before one that is scrolled away, and a folded one, which shows only a small
// picture, after both. A row of the Song panel asks much: it gives way to them all and then
// goes on from where it was.
const ORDER = { seen: 0, unseen: 1, folded: 2, row: 3 }
export type Asker = keyof typeof ORDER

const asks: { step: () => boolean; order: number }[] = []
let askTimer = 0
let asking = false
function askOn() {
    askTimer = 0
    asking = true
    const until = performance.now() + ASK_FOR
    while (asks.length && performance.now() < until) {
        const ask = asks[0]
        if (ask.step()) asks.splice(asks.indexOf(ask), 1)
    }
    asking = false
    if (asks.length) askTimer = window.setTimeout(askOn, 0)
}
// `step` asks about one thing more and says whether that was the last. A row starts on the spot
// when nothing else is being asked. A strip never does: it asks from the frame that begins a
// bar, and that frame is the one to keep short.
export function askSoon(step: () => boolean, who: Asker = 'row') {
    const order = ORDER[who]
    const before = asks.findIndex((ask) => ask.order > order)
    asks.splice(before < 0 ? asks.length : before, 0, { step, order })
    if (askTimer || asking) return
    if (who === 'row') askOn()
    else askTimer = window.setTimeout(askOn, 0)
}
