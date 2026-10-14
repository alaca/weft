import { onCleanup, onMount, Show } from 'solid-js'
import { performLarger, redoChange, saveSong, stop, togglePerform, togglePlay, undoChange, update } from './app/controller'
import { hearKeyboards, keysLetGo, pianoDown, pianoUp } from './app/piano'
import { editKey, watchPresses } from './app/clip'
import { DEMO } from './demo/demo'
import { SOUNDS_WIDTH } from './library/layout'
import { jamsOpen } from './stores/jam'
import { codeWidth, engineState, mixerOpen, performing, soundsOpen, soundsWidth, startOpen, viewMode } from './stores/song'
import { CodePane } from './ui/CodePane'
import { ExportDialog } from './ui/ExportDialog'
import { LeftColumn } from './ui/LeftColumn'
import { LinkDialog } from './ui/LinkDialog'
import { AccountDialog } from './ui/AccountDialog'
import { CloseDialog } from './ui/CloseDialog'
import { JamAsk } from './ui/JamAsk'
import { PublishDialog } from './ui/PublishDialog'
import { StartScreen } from './ui/StartScreen'
import { StatusBar } from './ui/StatusBar'
import { StripList } from './ui/StripList'
import { TooNarrow } from './ui/TooNarrow'
import { TopBar } from './ui/TopBar'
import { KnobLearn } from './ui/KnobLearn'
import { SoundDialog } from './ui/SoundDialog'
import { TrimDialog } from './ui/TrimDialog'
import { UpdateCard } from './ui/UpdateCard'

export function App() {
    const onKey = (event: KeyboardEvent) => {
        // On the start screen no song is in front, so the keys that act on a song do nothing.
        if (startOpen()) return
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 's') {
            event.preventDefault()
            if (!DEMO) saveSong()
            return
        }
        const target = event.target as HTMLElement | null
        // Updating the sound from the code and silencing it are keys of the editor. They do
        // the same from anywhere else in the window, so that a song whose code has an error
        // can be updated without first clicking into the code.
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && (event.key === 'Enter' || event.key === '.') && !target?.closest('.cm-editor, [role="dialog"]')) {
            event.preventDefault()
            if (event.key === 'Enter') update()
            else stop()
            return
        }
        // The performance view, and the size of the code in it.
        if ((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'f') {
            event.preventDefault()
            togglePerform()
            return
        }
        if (performing() && (event.metaKey || event.ctrlKey) && !event.altKey && ['=', '+', '-'].includes(event.key)) {
            event.preventDefault()
            performLarger(event.key === '-' ? -2 : 2)
            return
        }
        // Notes chosen in a roll and hits chosen in a grid are copied, pasted and taken out.
        if (editKey(event)) return void event.preventDefault()
        // The editor and text boxes undo by themselves. Anywhere else the same keys undo the
        // last change to the song, so a wrong click in a grid is one key away.
        const letter = event.key.toLowerCase()
        if ((event.metaKey || event.ctrlKey) && !event.altKey && (letter === 'z' || letter === 'y') && !target?.closest('.cm-editor, input, textarea, [role="dialog"]')) {
            event.preventDefault()
            if (letter === 'y' || event.shiftKey) redoChange()
            else undoChange()
            return
        }
        // A pattern that is played from the keyboard takes its letters before anything else does.
        if (pianoDown(event)) return void event.preventDefault()
        if (event.code !== 'Space') return
        // A note of a piano roll is a button that has no use for Space, and it has the focus after
        // every note put in or moved, so Space on it still plays the song.
        if (target?.closest('.cm-editor, input, textarea, button:not(.nt), [role="dialog"]')) return
        event.preventDefault()
        togglePlay()
    }
    let unwatch = () => undefined as void
    onMount(() => {
        unwatch = watchPresses()
        document.addEventListener('keydown', onKey)
        document.addEventListener('keyup', pianoUp)
        // A window that is left with keys down is never told that they came up.
        window.addEventListener('blur', keysLetGo)
        // The desktop app hears a MIDI keyboard from the start. A browser asks first, so there
        // it is left until a keyboard is asked for.
        if ('__TAURI_INTERNALS__' in window) void hearKeyboards()
    })
    onCleanup(() => {
        unwatch()
        document.removeEventListener('keydown', onKey)
        document.removeEventListener('keyup', pianoUp)
        window.removeEventListener('blur', keysLetGo)
    })

    return (
        <div
            class="app"
            data-view={performing() ? 'perform' : viewMode()}
            data-left={!performing() && (soundsOpen() || jamsOpen() || mixerOpen()) ? 'shown' : 'hidden'}
            data-playing={engineState().playing ? 'yes' : 'no'}
            style={{ '--sounds-w': `${soundsWidth() ?? SOUNDS_WIDTH}px`, '--code-w': codeWidth() === null ? undefined : `${codeWidth()}px` }}
        >
            <TopBar />
            {/* Out of the window while performing, so that nothing of them is drawn or worked out
                beside the code, and the sound has the window to itself. */}
            <Show when={!performing()}>
                <LeftColumn />
                <StripList />
            </Show>
            <CodePane />
            <StatusBar />
            <Show when={!DEMO} fallback={<TooNarrow />}>
                <StartScreen />
                <CloseDialog />
                <LinkDialog />
                <JamAsk />
                <UpdateCard />
                <ExportDialog />
                <TrimDialog />
                <SoundDialog />
                <KnobLearn />
                <PublishDialog />
                <AccountDialog />
            </Show>
        </div>
    )
}
