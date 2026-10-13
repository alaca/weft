import { SITE } from '../site/api'

// The app is laid out for a desktop window. On a screen as narrow as a phone's the demo says
// so, where the app would be too small to use. Whether it shows is up to the stylesheet.
export function TooNarrow() {
    return (
        <div class="narrow" role="status" data-testid="too-narrow">
            <h1>Weft Loom needs a wider screen</h1>
            <p>The demo is the app itself, and the app is made for desktop use. Open this page on a desktop or a laptop to try it.</p>
            <p>
                <a class="btn" href={SITE}>
                    Back to the site
                </a>
            </p>
        </div>
    )
}
