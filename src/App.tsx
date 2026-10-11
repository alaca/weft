import { onCleanup, onMount } from 'solid-js'
import { redoChange, saveSong, togglePlay, undoChange } from './app/controller'
import { SOUNDS_WIDTH } from './library/layout'
import { jamsOpen } from './stores/jam'
import { codeWidth, mixerOpen, soundsOpen, soundsWidth, startOpen, viewMode } from './stores/song'
import { CodePane } from './ui/CodePane'
import { ExportDialog } from './ui/ExportDialog'
import { LeftColumn } from './ui/LeftColumn'
import { AccountDialog } from './ui/AccountDialog'
import { CloseDialog } from './ui/CloseDialog'
import { JamAsk } from './ui/JamAsk'
import { PublishDialog } from './ui/PublishDialog'
import { StartScreen } from './ui/StartScreen'
import { StatusBar } from './ui/StatusBar'
import { StripList } from './ui/StripList'
import { TopBar } from './ui/TopBar'

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
        // The editor and text boxes undo by themselves. Anywhere else the same keys undo the
        // last change to the song, so a wrong click in a grid is one key away.
        const letter = event.key.toLowerCase()
        if ((event.metaKey || event.ctrlKey) && !event.altKey && (letter === 'z' || letter === 'y') && !target?.closest('.cm-editor, input, textarea, [role="dialog"]')) {
            event.preventDefault()
            if (letter === 'y' || event.shiftKey) redoChange()
            else undoChange()
            return
        }
        if (event.code !== 'Space') return
        if (target?.closest('.cm-editor, input, textarea, button, [role="dialog"]')) return
        event.preventDefault()
        togglePlay()
    }
    onMount(() => document.addEventListener('keydown', onKey))
    onCleanup(() => document.removeEventListener('keydown', onKey))

    return (
        <div
            class="app"
            data-view={viewMode()}
            data-left={soundsOpen() || jamsOpen() || mixerOpen() ? 'shown' : 'hidden'}
            style={{ '--sounds-w': `${soundsWidth() ?? SOUNDS_WIDTH}px`, '--code-w': codeWidth() === null ? undefined : `${codeWidth()}px` }}
        >
            <TopBar />
            <LeftColumn />
            <StripList />
            <CodePane />
            <StatusBar />
            <StartScreen />
            <CloseDialog />
            <JamAsk />
            <ExportDialog />
            <PublishDialog />
            <AccountDialog />
        </div>
    )
}
