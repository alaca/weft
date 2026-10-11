import { defineConfig, devices } from '@playwright/test'
import { STARTER } from './tests/songs'

// The app opens with its start screen and comes with no songs. Nearly every test is about the
// editor, so they start as a person does who has one song and has chosen to skip the start
// screen: the song that used to come with the app. The tests of the start screen undo this.
const origin = 'http://localhost:5180'
const storageState = { cookies: [], origins: [{ origin, localStorage: [{ name: 'weft.start', value: 'skip' }, { name: 'weft.song', value: STARTER }] }] }

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 60_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    workers: 1,
    reporter: 'line',
    use: {
        baseURL: origin,
        storageState,
        trace: 'retain-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                viewport: { width: 1440, height: 900 },
                launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
            },
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
        },
    ],
    webServer: {
        command: 'npx vite --port 5180',
        url: 'http://localhost:5180',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
})
