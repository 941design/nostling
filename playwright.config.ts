import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Exclude e2e/prod/ from regular runs - these tests require production mode
  // (no dev flags) and should be run separately via `make test-e2e-prod`
  testIgnore: ['**/prod/**'],
  timeout: 30000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report' }]
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Electron runs headless by default
    // Use --headed flag to see the browser window
  },
});
