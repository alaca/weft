export function App() {
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
            </section>
            <footer class="sbar" data-testid="status" />
        </div>
    )
}
