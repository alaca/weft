import { Show } from 'solid-js'
import { dragShare, dragSounds, usualWidth } from '../app/controller'
import { SOUNDS_SHARE, SOUNDS_WIDTH } from '../library/layout'
import { jamsOpen, soundsShare } from '../stores/jam'
import { folded, mixerOpen, soundsOpen, soundsWidth } from '../stores/song'
import { Divider } from './Divider'
import { JamPanel } from './JamPanel'
import { MixerPanel } from './MixerPanel'
import { SoundBrowser } from './SoundBrowser'

const STEP = 0.04

// The column on the left: the mixer at its head, the sounds and the jam under it, or any of
// them alone. With sounds and jam, the line between them is dragged up and down, the arrow keys do the same a little at a time, and a
// double click gives the usual share back.
export function LeftColumn() {
    let column: HTMLDivElement | undefined
    let dragging = false
    const share = () => soundsShare() ?? SOUNDS_SHARE
    // The line between the sounds and the jam is only there while both are unfolded.
    const both = () => soundsOpen() && jamsOpen() && !folded().includes('sounds') && !folded().includes('jams')
    const wanted = (event: PointerEvent) => {
        const box = column!.getBoundingClientRect()
        return (event.clientY - box.top) / box.height
    }
    return (
        <Show when={soundsOpen() || jamsOpen() || mixerOpen()}>
            <div class="lc" classList={{ both: both() }} style={{ '--sounds-share': `${share() * 100}%` }} ref={column}>
                <Divider side="right" label="Width of the sounds" width={() => soundsWidth() ?? SOUNDS_WIDTH} onDrag={dragSounds} onUsual={() => usualWidth('sounds')} />
                <MixerPanel />
                <SoundBrowser />
                <Show when={both()}>
                    <div
                        class="share"
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label="Height of the sounds"
                        title="Drag to give the sounds or the jam more room. Double click for the usual."
                        tabindex="0"
                        onPointerDown={(event) => {
                            if (event.button !== 0) return
                            dragging = true
                            event.currentTarget.setPointerCapture(event.pointerId)
                            event.preventDefault()
                        }}
                        onPointerMove={(event) => {
                            if (dragging) dragShare(wanted(event), false)
                        }}
                        onPointerUp={(event) => {
                            if (!dragging) return
                            dragging = false
                            dragShare(wanted(event), true)
                        }}
                        onPointerCancel={() => {
                            dragging = false
                        }}
                        onDblClick={() => dragShare(null, true)}
                        onKeyDown={(event) => {
                            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                            event.preventDefault()
                            dragShare(share() + (event.key === 'ArrowDown' ? STEP : -STEP), true)
                        }}
                    />
                </Show>
                <JamPanel />
            </div>
        </Show>
    )
}
