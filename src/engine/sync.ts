import { collab, getSyncedVersion, receiveUpdates, sendableUpdates } from '@codemirror/collab'
import { ChangeSet, Compartment, StateEffect, Transaction, type Extension, type Text } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { SentUpdate } from '../jam/protocol'

// Two people on one song: every change either makes to the code is sent to the other, and each
// fits the other's changes to their own, so both end up with the same code whatever order the
// changes were made in. Controls change the code, so they are shared without more.

// Said by whoever makes the song sound as its code now reads. It travels in line with the
// changes, so the other makes the song sound that way at the same point in them.
export const heard = StateEffect.define<null>()
export const syncSlot = new Compartment()

export type Sync = { extension: Extension; receive(view: EditorView, updates: SentUpdate[]): void }
export type RemoteEvents = { changed(): void; heard(): void }

const said = (tr: Transaction) => tr.effects.some((effect) => effect.is(heard))

const together = (changes: readonly ChangeSet[]): ChangeSet | null => (changes.length ? changes.reduce((all, next) => all.compose(next)) : null)

function spans(changes: ChangeSet): [number, number][] {
    const found: [number, number][] = []
    changes.iterChangedRanges((from, to) => void found.push([from, to]))
    return found
}

// Whether two changes to the same code rewrote the same stretch of it: one a number, the other
// the same number. Changes that only stand next to each other, or put something in at the
// same place, do not.
export function collide(one: ChangeSet, other: ChangeSet): boolean {
    const others = spans(other)
    return spans(one).some(([from, to]) => others.some(([otherFrom, otherTo]) => (from < otherTo && otherFrom < to) || (from === to && otherFrom < from && from < otherTo) || (otherFrom === otherTo && from < otherFrom && otherFrom < to)))
}

export function createSync(start: Text, version: number, by: string, send: (version: number, updates: SentUpdate[]) => void, remote: RemoteEvents): Sync {
    // The code as both have it: every change that went through the relay, in its order, and
    // none of yours that are still on their way.
    let shared = start
    // What was sent is answered before more is sent: either it comes back, which means it was
    // taken, or the other's changes come first, and then it is fitted to those and sent again.
    let waiting = false
    const push = (view: EditorView) => {
        if (waiting) return
        const updates = sendableUpdates(view.state)
        if (!updates.length) return
        waiting = true
        send(
            getSyncedVersion(view.state),
            updates.map((update) => ({ by: update.clientID, changes: update.changes.toJSON(), ...(update.effects?.some((effect) => effect.is(heard)) ? { heard: true as const } : {}) })),
        )
    }
    return {
        extension: [
            collab({ startVersion: version, clientID: by, sharedEffects: (tr) => tr.effects.filter((effect) => effect.is(heard)) }),
            EditorView.updateListener.of((update) => {
                let mine = false
                for (const tr of update.transactions) {
                    if (!tr.annotation(Transaction.remote)) {
                        mine ||= tr.docChanged || said(tr)
                        continue
                    }
                    if (tr.docChanged) remote.changed()
                    if (said(tr)) remote.heard()
                }
                if (mine) push(update.view)
            }),
        ],
        receive(view, updates) {
            waiting = false
            const read = updates.map((update) => ({ clientID: update.by, changes: ChangeSet.fromJSON(update.changes), effects: update.heard ? [heard.of(null)] : [] }))
            const theirs = read[0]?.clientID === by ? null : together(read.map((update) => update.changes))
            const mine = theirs ? together(sendableUpdates(view.state).map((update) => update.changes)) : null
            for (const update of read) shared = update.changes.apply(shared)
            view.dispatch(receiveUpdates(view.state, read))
            // Fitting two changes to each other keeps what both put in. When both rewrote the
            // same stretch that leaves the two versions side by side, which is neither. Theirs
            // got to the relay first, so it stands, and yours is taken out again here; the
            // taking out travels to them like any change.
            if (theirs && mine && collide(theirs, mine)) {
                let doc = shared
                const back: ChangeSet[] = []
                for (const update of sendableUpdates(view.state)) {
                    back.unshift(update.changes.invert(doc))
                    doc = update.changes.apply(doc)
                }
                const undone = together(back)
                if (undone) view.dispatch({ changes: undone, annotations: Transaction.addToHistory.of(false) })
            }
            push(view)
        },
    }
}
