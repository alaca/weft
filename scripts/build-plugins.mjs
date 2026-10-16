// Compiles the Faust plugins in plugins/ into public/plugins/<name>/, where the app loads them:
// dsp-module.wasm is the plugin and dsp-meta.json says what its knobs are. It also bundles the
// part of Faust that plays them into public/plugins/faust.js. Run after a plugin is changed;
// what it writes is kept with the code, so a build of the app needs no Faust.
import { execFileSync } from 'node:child_process'
import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'vite'

const here = join(import.meta.dirname, '..')
const compiler = join(here, 'node_modules/@grame/faustwasm/scripts/faust2wasm.js')
for (const file of readdirSync(join(here, 'plugins')).filter((name) => name.endsWith('.dsp'))) {
    const name = file.replace(/\.dsp$/, '')
    const out = join(here, 'public/plugins', name)
    rmSync(out, { recursive: true, force: true })
    execFileSync(process.execPath, [compiler, join(here, 'plugins', file), out, '-no-template'], { stdio: 'inherit' })
}
await build({
    configFile: false,
    logLevel: 'warn',
    publicDir: false,
    build: {
        lib: { entry: join(here, 'plugins/runtime.js'), formats: ['es'], fileName: () => 'faust.js' },
        outDir: join(here, 'public/plugins'),
        emptyOutDir: false,
        minify: false,
        target: 'esnext',
        // Only the part of Faust that reads a compiler from disk asks for these, and the app never does.
        rollupOptions: { external: ['fs', 'url', 'module', 'path', 'process'] },
    },
})
