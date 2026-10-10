import { onMount } from 'solid-js'
import { createEngine } from './engine/engine'
import { STARTER } from './song/starter'

export function App() {
    let editorRoot!: HTMLDivElement
    onMount(async () => {
        const engine = createEngine()
        await engine.mount(editorRoot, STARTER)
        if (import.meta.env.DEV) (window as any).__weft = { engine }
    })
    return (
        <div class="app" data-view="both">
            <header class="top" data-testid="top">
                <div class="word">Weft</div>
            </header>
            <main class="ctl" data-testid="controls" />
            <section class="code" data-testid="code">
                <div class="code-h">
                    <h2>Code</h2>
                </div>
                <div class="ed" ref={editorRoot} />
            </section>
            <footer class="sbar" data-testid="status" />
        </div>
    )
}
