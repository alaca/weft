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
