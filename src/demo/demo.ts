// The app as the site shows it in a browser, to be tried before it is downloaded. It plays the
// songs it comes with and lets them be changed, and there it ends: nothing is saved, opened,
// exported, published or recorded, there are no jams, and nothing is kept in the browser.
// While the app is being worked on, `?demo` in the address shows it.
export const DEMO: boolean = import.meta.env.VITE_DEMO === '1' || (import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo'))
