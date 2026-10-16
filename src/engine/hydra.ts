import { getTime, reify } from '@strudel/core'
import { getDrawContext } from '@strudel/draw'

// Hydra, the live video synth Strudel works with, drawn behind the code. Strudel's own
// initHydra fetches Hydra from the internet as the song runs; here it comes with the app, is
// only loaded once a song asks for it, and is taken away again with everything it changed.
// Hydra puts its functions on the window, some under names Strudel has too (speed, shape,
// noise, time, hush). What they were is kept and put back when Hydra goes.

type Made = { hydra: any; canvas: HTMLCanvasElement; asked: string; frame: number; watch: ResizeObserver | null; before: Map<string, PropertyDescriptor | undefined> }

const same = (a: PropertyDescriptor | undefined, b: PropertyDescriptor | undefined) => (a && b ? ('value' in a ? a.value === b.value : a.get === b.get && a.set === b.set) : a === b)
let made: Made | null = null
let making: Promise<any> | null = null

const SHOWN = 'hydra'

export async function initHydra(options: Record<string, unknown> = {}): Promise<any> {
    const asked = JSON.stringify(options)
    if (made && made.asked !== asked) clearHydra()
    if (made) return made.hydra
    making ??= start(options, asked).finally(() => (making = null))
    return making
}

async function start(options: Record<string, unknown>, asked: string): Promise<any> {
    const place = document.querySelector<HTMLElement>('[data-testid="code"] .ed')
    if (!place) throw new Error('Hydra is drawn behind the code, and there is no code here.')
    // Parts of Hydra were written for Node, and look for its name for the window.
    const shared = globalThis as unknown as { global?: unknown }
    shared.global ??= globalThis
    const before = new Map(Object.getOwnPropertyNames(window).map((name) => [name, Object.getOwnPropertyDescriptor(window, name)]))
    const { default: Hydra } = await import('hydra-synth')
    const { feedStrudel = false, pixelRatio = 1, ...config } = { detectAudio: false, ...options } as Record<string, any>
    const canvas = document.createElement('canvas')
    canvas.id = 'hydra-canvas'
    canvas.className = 'hy'
    canvas.setAttribute('aria-hidden', 'true')
    place.prepend(canvas)
    const size = (): [number, number] => [Math.max(1, Math.round(place.clientWidth * pixelRatio)), Math.max(1, Math.round(place.clientHeight * pixelRatio))]
    const [width, height] = size()
    const hydra = new Hydra({ ...config, canvas, width, height, autoLoop: false, enableStreamCapture: false })
    if (feedStrudel) hydra.synth.s0.init({ src: getDrawContext().canvas })
    let last = performance.now()
    const tick = (now: number) => {
        const current = made
        if (current?.hydra !== hydra || !current) return
        hydra.tick(now - last)
        last = now
        current.frame = requestAnimationFrame(tick)
    }
    const watch =
        typeof ResizeObserver === 'undefined'
            ? null
            : new ResizeObserver(() => {
                  const [wide, high] = size()
                  if (wide === hydra.width && high === hydra.height) return
                  // Hydra says the new size in the console each time; that is kept out of it.
                  const log = console.log
                  console.log = () => undefined
                  try {
                      hydra.setResolution(wide, high)
                  } finally {
                      console.log = log
                  }
              })
    watch?.observe(place)
    made = { hydra, canvas, asked, frame: requestAnimationFrame(tick), watch, before }
    document.documentElement.dataset.shows = SHOWN
    return hydra
}

export function clearHydra() {
    if (!made) return
    const { hydra, canvas, frame, watch, before } = made
    made = null
    cancelAnimationFrame(frame)
    watch?.disconnect()
    try {
        hydra.hush()
        hydra.regl?.destroy()
    } catch {
        // Gone either way.
    }
    canvas.remove()
    // Whatever of the window's is not as it was before Hydra came is put back as it was, and
    // what Hydra added is taken away.
    for (const name of Object.getOwnPropertyNames(window)) {
        const was = before.get(name)
        if (same(was, Object.getOwnPropertyDescriptor(window, name))) continue
        try {
            if (was) Object.defineProperty(window, name, was)
            else delete (window as unknown as Record<string, unknown>)[name]
        } catch {
            // One the window does not let go of stays.
        }
    }
    if (document.documentElement.dataset.shows === SHOWN) delete document.documentElement.dataset.shows
}

// A pattern as a value Hydra reads anew on every frame: what the pattern plays at that moment.
export const H = (pattern: unknown) => () => reify(pattern).queryArc(getTime(), getTime())[0]?.value

// Hydra stays while the code asks for it; code that no longer does takes it away.
export function hydraAfter(code: string) {
    if (!made && !making) return
    const asks = code.split('\n').some((line) => /\binitHydra\s*\(/.test(line.replace(/(^|[^:])\/\/.*$/, '$1')))
    if (!asks) clearHydra()
}
