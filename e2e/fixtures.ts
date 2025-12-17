import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

type ElectronFixtures = {
  electronApp: ElectronApplication;
  page: Page;
};

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use, testInfo) => {
    // Create a unique data directory for this test to ensure isolation
    // This prevents identity/subscription accumulation across tests
    const testDataDir = path.join(
      process.env.NOSTLING_DATA_DIR || path.join(os.tmpdir(), 'nostling-e2e-data'),
      `test-${testInfo.testId}-${Date.now()}`
    );
    fs.mkdirSync(testDataDir, { recursive: true });

    // Build launch args - Electron flags must come BEFORE the main entry script
    const launchArgs: string[] = [];

    // Add flags for Linux CI to handle headless environment
    // These MUST be added before the main entry point
    const isLinuxCI = process.env.CI && process.platform === 'linux';

    if (isLinuxCI) {
      launchArgs.push(
        '--no-sandbox',              // Avoid chrome-sandbox permission issues
        '--disable-gpu',             // Disable GPU hardware acceleration in headless mode
        '--disable-dev-shm-usage',   // Use /tmp instead of /dev/shm in containerized environments
        '--password-store=gnome-libsecret'  // Use gnome-keyring for secure storage
      );
    }

    // Main entry script must come AFTER all flags
    launchArgs.push(path.join(__dirname, '../dist/main/index.js'));

    // Prepare environment variables
    const launchEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      NODE_ENV: 'test',
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      // Use isolated data directory for this test
      NOSTLING_DATA_DIR: testDataDir,
    };

    if (process.env.NOSTLING_DEV_RELAY) {
      launchEnv.NOSTLING_DEV_RELAY = process.env.NOSTLING_DEV_RELAY;
    }

    const electronApp = await electron.launch({
      args: launchArgs,
      env: launchEnv,
    });

    await use(electronApp);
    await electronApp.close();

    // Clean up test data directory after test completes
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
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

export { expect, Page } from '@playwright/test';
