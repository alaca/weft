// What the app takes from Faust to play a compiled plugin. Bundled by scripts/build-plugins.mjs
// into public/plugins/faust.js, unminified: Faust writes the code its audio thread runs out of
// its own classes, as text, and a minifier's short names would not be there to find.
export { FaustMonoDspGenerator } from '@grame/faustwasm/dist/src/FaustDspGenerator.js'
