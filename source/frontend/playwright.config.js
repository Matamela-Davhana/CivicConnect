import { defineConfig } from '@playwright/test'
import process from 'node:process'
import safety from '../../tools/devops/e2e-safety.cjs'

safety.assertDisposable(process.env, true)
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    browserName: 'chromium',
    headless: true,
    screenshot: 'only-on-failure',
    // Do not retain authentication tokens/passwords in network traces or videos.
    trace: 'off',
    video: 'off',
  },
})
