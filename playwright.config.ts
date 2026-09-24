import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT || 5174)
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${PORT}`

// Supabase mode only when shell/CI env provides credentials and VITE_DUMMY is not forced.
// `.env` is never read here — Vite loads it, but webServer env below overrides it.
const forceDummy = process.env.VITE_DUMMY === '1'
const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || ''
const useSupabase = !forceDummy && Boolean(supabaseUrl && supabaseAnonKey)

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
    // Always start a fresh server — never reuse an existing one
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      VITE_DUMMY: useSupabase ? '' : '1',
      VITE_SUPABASE_URL: useSupabase ? supabaseUrl : '',
      VITE_SUPABASE_ANON_KEY: useSupabase ? supabaseAnonKey : '',
    },
  },
})
