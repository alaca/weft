import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 60_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    workers: 1,
    reporter: 'line',
    use: {
        baseURL: 'http://localhost:5180',
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
    ],
    webServer: {
        command: 'npx vite --port 5180',
        url: 'http://localhost:5180',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
})
