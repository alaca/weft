// First, so that in the demo nothing that is loaded after it finds the browser's own storage.
import './library/kept'
import { render } from 'solid-js/web'
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource-variable/martian-mono/wdth.css'
import '@fontsource-variable/piazzolla/opsz.css'
import '@fontsource-variable/piazzolla/opsz-italic.css'
import './styles/tokens.css'
import './styles/app.css'
import { App } from './App'
import { DEMO } from './demo/demo'
import { keepSoundsHere } from './library/keptSounds'

// The demo keeps nothing in the browser, so there every sound is fetched each time.
if (!DEMO) keepSoundsHere()

// The demo's songs are there before the app looks for the song to open with. What is asked first
// is known when the app is built, so the app that is downloaded does not carry them.
if ((import.meta.env.VITE_DEMO === '1' || import.meta.env.DEV) && DEMO) (await import('./demo/songs')).fillDemo()

render(() => <App />, document.getElementById('root')!)
