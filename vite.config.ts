import { defineConfig } from 'vitest/config'
import solidPlugin from 'vite-plugin-solid'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
    plugins: [solidPlugin()],
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
    },
})
