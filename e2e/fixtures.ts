import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';

type ElectronFixtures = {
  electronApp: ElectronApplication;
  page: Page;
};

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    const launchArgs = [path.join(__dirname, '../dist/main/index.js')];

    // Add flags for Linux CI to handle headless environment
    if (process.env.CI && process.platform === 'linux') {
      launchArgs.push(
        '--no-sandbox',              // Avoid chrome-sandbox permission issues
        '--disable-gpu',             // Disable GPU hardware acceleration in headless mode
        '--disable-dev-shm-usage'    // Use /tmp instead of /dev/shm in containerized environments
      );
    }

    const electronApp = await electron.launch({
      args: launchArgs,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
        // Pass through env vars for dev/e2e environment isolation
        ...(process.env.NOSTLING_DATA_DIR && { NOSTLING_DATA_DIR: process.env.NOSTLING_DATA_DIR }),
        ...(process.env.NOSTLING_DEV_RELAY && { NOSTLING_DEV_RELAY: process.env.NOSTLING_DEV_RELAY }),
      },
    });

    await use(electronApp);
    await electronApp.close();
  },

  page: async ({ electronApp }, use) => {
    // BUG FIX: Window creation timing - ensure window is fully loaded before use
    // Root cause: firstWindow() may return before DOM is ready
    // Bug report: bug-reports/window-creation-timing.md
    // Fixed: 2025-12-06
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await use(page);
  },
});

export { expect } from '@playwright/test';
