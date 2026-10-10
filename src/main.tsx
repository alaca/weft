import { render } from 'solid-js/web'
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource-variable/martian-mono/wdth.css'
import '@fontsource-variable/piazzolla/opsz.css'
import '@fontsource-variable/piazzolla/opsz-italic.css'
import './styles/tokens.css'
import './styles/app.css'
import { App } from './App'

render(() => <App />, document.getElementById('root')!)
