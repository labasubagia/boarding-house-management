import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
    // CI/local under load can exceed the 5s default
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // Unit tests always run dummy-mode (ignore local .env Supabase credentials)
    env: {
      VITE_DUMMY: '1',
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
  },
})
