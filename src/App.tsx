import { onCleanup, onMount } from 'solid-js'
import { saveSong, togglePlay } from './app/controller'
import { viewMode } from './stores/song'
import { CodePane } from './ui/CodePane'
import { SoundBrowser } from './ui/SoundBrowser'
import { StatusBar } from './ui/StatusBar'
import { StripList } from './ui/StripList'
import { TopBar } from './ui/TopBar'

export function App() {
    const onKey = (event: KeyboardEvent) => {
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 's') {
            event.preventDefault()
            saveSong()
            return
        }
        if (event.code !== 'Space') return
        const target = event.target as HTMLElement | null
        if (target?.closest('.cm-editor, input, textarea, button')) return
        event.preventDefault()
        togglePlay()
    }
    onMount(() => document.addEventListener('keydown', onKey))
    onCleanup(() => document.removeEventListener('keydown', onKey))

    return (
        <div class="app" data-view={viewMode()}>
            <TopBar />
            <StripList />
            <CodePane />
            <StatusBar />
            <SoundBrowser />
        </div>
    )
}
