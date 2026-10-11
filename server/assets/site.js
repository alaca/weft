// What the pages do when scripts run. None of it is needed: without this file a play button is
// a plain link to the preview, which the browser plays by itself. With it a preview plays in
// the page with its progress drawn.
let audio = null
let sounding = null

const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
const press = (play, on) => play.setAttribute('aria-pressed', String(on))

// How far the preview is, on whatever holds the button that started it. The pages draw it from
// there: a line under a row, the lit part of a waveform.
function drawn() {
    const box = sounding && sounding.closest('[data-player]')
    if (!box) return
    const whole = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Number(box.dataset.seconds) || 0
    box.style.setProperty('--at', whole ? `${Math.min(100, (audio.currentTime / whole) * 100)}%` : '0%')
    const now = box.querySelector('[data-now]')
    if (now) now.textContent = clock(audio.currentTime)
}

function toggle(play) {
    audio ??= player()
    if (play === sounding && !audio.paused) return audio.pause()
    if (play !== sounding) {
        if (sounding) press(sounding, false)
        sounding = play
        audio.src = play.href
    }
    audio.play().catch(() => press(play, false))
}

// The one player of the page, made when a preview is first asked for.
function player() {
    const made = new Audio()
    made.preload = 'none'
    made.addEventListener('play', () => sounding && press(sounding, true))
    made.addEventListener('pause', () => sounding && press(sounding, false))
    made.addEventListener('timeupdate', drawn)
    made.addEventListener('ended', () => {
        made.currentTime = 0
        drawn()
    })
    return made
}

document.addEventListener('click', (event) => {
    const play = event.target.closest('a.play')
    if (!play || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    toggle(play)
})

// A link answers to Enter and a button to the space bar as well. These are links that act as
// buttons, so they are given the space bar.
document.addEventListener('keydown', (event) => {
    if (event.key !== ' ' || !event.target.matches('a.play')) return
    event.preventDefault()
    toggle(event.target)
})

document.addEventListener('DOMContentLoaded', () => {
    for (const play of document.querySelectorAll('a.play')) {
        play.setAttribute('role', 'button')
        press(play, false)
    }
})

// The pictures of the app on the first page. Without this file they are three pictures side by
// side that are swiped through, and the marks under them are plain links to each. With it a
// mark moves to its picture without the page jumping, the mark of the picture in sight is lit,
// and the pictures move on by themselves until someone takes them in hand.
function pictures(box) {
    const row = box.querySelector('.shots-row')
    const marks = [...box.querySelectorAll('.shots-nav a')]
    if (!row || !marks.length) return
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let touched = false
    const inSight = () => Math.min(marks.length - 1, Math.max(0, Math.round(row.scrollLeft / row.clientWidth)))
    const light = () => marks.forEach((mark, at) => (at === inSight() ? mark.setAttribute('aria-current', 'true') : mark.removeAttribute('aria-current')))
    const go = (at) => row.scrollTo({ left: at * row.clientWidth, behavior: calm ? 'auto' : 'smooth' })
    row.addEventListener('scroll', light, { passive: true })
    for (const taking of ['pointerdown', 'keydown', 'wheel', 'touchstart']) box.addEventListener(taking, () => (touched = true), { passive: true })
    marks.forEach((mark, at) =>
        mark.addEventListener('click', (event) => {
            event.preventDefault()
            go(at)
        }),
    )
    row.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        go(inSight() + (event.key === 'ArrowRight' ? 1 : -1))
    })
    if (calm) return
    setInterval(() => {
        if (touched || document.hidden || box.matches(':hover')) return
        go((inSight() + 1) % marks.length)
    }, 6500)
}

document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('[data-shots]').forEach(pictures))

