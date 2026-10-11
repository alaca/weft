import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'rolldown'

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
console.log(`built ${out}`)
