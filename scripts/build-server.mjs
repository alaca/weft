import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'rolldown'
import { build as buildApp } from 'vite'

// The site and the relay as one file that runs with Node alone, with the files the site serves
// beside it. What comes out in dist-server is all a server needs: no packages are installed
// there.
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'dist-server')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'assets', 'fonts'), { recursive: true })

await build({
    input: join(root, 'server', 'start.ts'),
    platform: 'node',
    // Two packages that ws only uses when they happen to be installed.
    external: ['bufferutil', 'utf-8-validate'],
    output: { file: join(out, 'server.mjs'), format: 'esm', codeSplitting: false },
})

cpSync(join(root, 'server', 'assets'), join(out, 'assets'), { recursive: true })
for (const family of ['archivo', 'martian-mono', 'piazzolla']) {
    const files = join(root, 'node_modules', '@fontsource-variable', family, 'files')
    if (!existsSync(files)) throw new Error(`The fonts of ${family} are not installed.`)
    for (const name of readdirSync(files)) if (name.endsWith('.woff2')) cpSync(join(files, name), join(out, 'assets', 'fonts', name))
}

// The app as it is tried in a browser, which the site serves at /demo.
process.env.VITE_DEMO = '1'
await buildApp({ root, base: '/demo/', logLevel: 'warn', build: { outDir: join(out, 'demo'), emptyOutDir: true } })
console.log(`built ${out}`)
