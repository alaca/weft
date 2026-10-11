import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import { createRelay, type Relay } from './server/relay.ts'
import { createSite, type Site } from './server/site.ts'

const host = process.env.TAURI_DEV_HOST

// While the app is being worked on, the relay of a jam runs beside it on this machine, so two
// windows here can jam. It is kept across restarts of the dev server, which make a new one.
const RELAY_PORT = 5190
// So does the site that songs are published to, keeping what it is given in a folder of this
// project that is not part of it. No mail is sent from here: a sign-in link is handed back.
const SITE_PORT = 5191
const SITE_DATA = new URL('./server/.data', import.meta.url).pathname
const held = globalThis as { __weftRelay?: Promise<Relay | null>; __weftSite?: Promise<Site | null> }
const devRelay = (): Plugin => ({
    name: 'weft-jam-relay',
    apply: 'serve',
    configureServer() {
        if (process.env.VITEST) return
        held.__weftRelay = (held.__weftRelay ?? Promise.resolve(null))
            .then((before) => before?.close())
            .then(() => createRelay({ port: RELAY_PORT }))
            .then(
                (relay) => (console.log(`  jam relay on ws://127.0.0.1:${relay.port}`), relay),
                (err) => (console.log(`  jam relay not started: ${err?.code ?? err}`), null),
            )
        held.__weftSite = (held.__weftSite ?? Promise.resolve(null))
            .then((before) => before?.close())
            .then(() => createSite({ port: SITE_PORT, dataDir: process.env.WEFT_SITE_DATA ?? SITE_DATA, asks: 100000 }))
            .then(
                (site) => (console.log(`  song site on ${site.origin}`), site),
                (err) => (console.log(`  song site not started: ${err?.code ?? err}`), null),
            )
    },
})

export default defineConfig({
    plugins: [solidPlugin(), devRelay()],
    clearScreen: false,
    server: {
        port: 5180,
        strictPort: true,
        host: host || false,
        hmr: host ? { protocol: 'ws', host, port: 5181 } : undefined,
        watch: { ignored: ['**/src-tauri/**'] },
    },
    envPrefix: ['VITE_', 'TAURI_ENV_*'],
    build: { target: 'esnext' },
    resolve: {
        dedupe: ['@strudel/core', '@codemirror/state', '@codemirror/view', '@codemirror/language', '@lezer/highlight'],
    },
    test: {
        include: ['tests/unit/**/*.test.ts'],
        environment: 'node',
        // The relay of a jam is tested as it runs, on Node, where its websocket library is not
        // the one a browser gets.
        alias: { ws: new URL('./node_modules/ws/wrapper.mjs', import.meta.url).pathname },
    },
})
