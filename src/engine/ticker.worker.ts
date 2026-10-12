// The timers of ./ticker, kept where a window that is out of sight does not slow them.
const timers = new Map<number, ReturnType<typeof setInterval>>()

onmessage = ({ data }: MessageEvent<{ id: number; ms?: number }>) => {
    if (data.ms === undefined) {
        clearInterval(timers.get(data.id))
        timers.delete(data.id)
    } else {
        timers.set(data.id, setInterval(() => postMessage(data.id), data.ms))
    }
}

postMessage('ready')

export {}
