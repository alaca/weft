import { createEffect, onCleanup, onMount } from 'solid-js'
import { setMasterVolume, waveformOf } from '../app/controller'
import type { ControlView } from '../controls/views'
import { engineState, masterVolume } from '../stores/song'
import { Knob } from './Knob'

export function OutputStrip() {
    let canvas!: HTMLCanvasElement
    let frame = 0

    const paint = (data: Float32Array | null) => {
        const scale = window.devicePixelRatio || 1
        const width = Math.round(canvas.clientWidth * scale)
        const height = Math.round(canvas.clientHeight * scale)
        if (!width || !height) return
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width
            canvas.height = height
        }
        const context = canvas.getContext('2d')
        if (!context) return
        const styles = getComputedStyle(canvas)
        context.clearRect(0, 0, width, height)
        context.strokeStyle = styles.getPropertyValue('--seam')
        context.lineWidth = scale
        context.beginPath()
        context.moveTo(0, height / 2)
        context.lineTo(width, height / 2)
        context.stroke()
        if (!data || !data.length) return
        context.strokeStyle = styles.getPropertyValue('--linen')
        context.lineWidth = 1.3 * scale
        context.beginPath()
        for (let i = 0; i < data.length; i++) {
            const x = (i / (data.length - 1)) * width
            const y = height / 2 - Math.max(-1, Math.min(1, data[i])) * (height / 2 - scale)
            if (i) context.lineTo(x, y)
            else context.moveTo(x, y)
        }
        context.stroke()
    }

    const loop = () => {
        paint(waveformOf())
        frame = requestAnimationFrame(loop)
    }

    onMount(() => paint(null))
    createEffect(() => {
        cancelAnimationFrame(frame)
        if (engineState().playing) frame = requestAnimationFrame(loop)
        else if (canvas) paint(null)
    })
    onCleanup(() => cancelAnimationFrame(frame))

    const volume = (): ControlView => ({
        fn: 'master',
        label: 'Volume',
        group: 'effects',
        describe: 'How loud everything is. This is your listening volume, not part of the song.',
        state: 'number',
        value: masterVolume(),
        min: 0,
        max: 1.5,
        scale: 'linear',
        text: `${Math.round(masterVolume() * 100)}%`,
    })

    return (
        <section class="out" data-testid="output" style={{ '--h': 'var(--linen-2)' }}>
            <div>
                <h3>Output</h3>
                <p>What you hear, right now</p>
            </div>
            <canvas class="scope" ref={canvas} />
            <Knob view={volume()} onChange={setMasterVolume} />
        </section>
    )
}
