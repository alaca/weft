// The tries of each sender within a stretch of time, for the limits that are kept per sender.
// A try that is refused is not counted. So a sender who goes on trying costs no more each time
// and takes up no more room, and is let through again once a try that was counted is older than
// that stretch: whoever waits that long is always let through.
export type Tries = {
    // True when this sender has had as many tries in that time as there may be.
    tooMany: (who: string, most: number) => boolean
    // Lets go of every sender with no try left in that time. One who never comes back would be
    // held for good otherwise.
    forget: () => void
    senders: () => number
}

export function createTries(within: number, now: () => number): Tries {
    // The senders stand in the order of their last counted try, so those to forget are in front.
    const asked = new Map<string, number[]>()
    return {
        tooMany(who, most) {
            const at = now()
            const times = asked.get(who) ?? []
            // The oldest are in front.
            let old = 0
            while (old < times.length && times[old] <= at - within) old++
            if (old) times.splice(0, old)
            if (times.length >= most) return true
            times.push(at)
            asked.delete(who)
            asked.set(who, times)
            return false
        },
        forget() {
            const since = now() - within
            for (const [who, times] of asked) {
                if (times.some((at) => at > since)) return
                asked.delete(who)
            }
        },
        senders: () => asked.size,
    }
}
