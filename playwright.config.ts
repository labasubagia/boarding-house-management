import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT || 5174)
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'e2e/output/test-results',
  use: {
    baseURL,
    headless: true,
    acceptDownloads: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT}`,
    url: baseURL,
    // Always start a fresh dummy-mode server — never reuse a Supabase-mode dev server
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      VITE_DUMMY: '1',
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
  },
})
