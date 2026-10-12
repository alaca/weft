import { onCleanup, onMount } from 'solid-js'
import { play, redoChange, saveSong, stop, togglePlay, undoChange } from './app/controller'
import { pianoDown, pianoUp } from './app/piano'
import { SOUNDS_WIDTH } from './library/layout'
import { jamsOpen } from './stores/jam'
import { codeWidth, engineState, mixerOpen, soundsOpen, soundsWidth, startOpen, viewMode } from './stores/song'
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
import { TopBar } from './ui/TopBar'
import { TrimDialog } from './ui/TrimDialog'
import { UpdateCard } from './ui/UpdateCard'

export function App() {
    const onKey = (event: KeyboardEvent) => {
        // On the start screen no song is in front, so the keys that act on a song do nothing.
        if (startOpen()) return
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 's') {
            event.preventDefault()
            saveSong()
            return
        }
        const target = event.target as HTMLElement | null
        // Updating the sound from the code and silencing it are keys of the editor. They do
        // the same from anywhere else in the window, so that a song whose code has an error
        // can be updated without first clicking into the code.
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && (event.key === 'Enter' || event.key === '.') && !target?.closest('.cm-editor, [role="dialog"]')) {
            event.preventDefault()
            if (event.key === 'Enter') play()
            else stop()
            return
        }
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
    onMount(() => {
        document.addEventListener('keydown', onKey)
        document.addEventListener('keyup', pianoUp)
    })
    onCleanup(() => {
        document.removeEventListener('keydown', onKey)
        document.removeEventListener('keyup', pianoUp)
    })

    return (
        <div
            class="app"
            data-view={viewMode()}
            data-left={soundsOpen() || jamsOpen() || mixerOpen() ? 'shown' : 'hidden'}
            data-playing={engineState().playing ? 'yes' : 'no'}
            style={{ '--sounds-w': `${soundsWidth() ?? SOUNDS_WIDTH}px`, '--code-w': codeWidth() === null ? undefined : `${codeWidth()}px` }}
        >
            <TopBar />
            <LeftColumn />
            <StripList />
            <CodePane />
            <StatusBar />
            <StartScreen />
            <CloseDialog />
            <LinkDialog />
            <JamAsk />
            <UpdateCard />
            <ExportDialog />
            <TrimDialog />
            <PublishDialog />
            <AccountDialog />
        </div>
    )
}
