/**
 * E2E Test: Identity Secret Loading in Dev Mode
 *
 * Bug report: bug-reports/identity-secret-loading-dev-mode-report.md
 *
 * Reproduces the bug where updating identity profiles fails after app restart
 * in dev mode with persisted data due to safeStorage encryption key changes.
 *
 * Expected: Identity secrets should be retrievable across app restarts
 * Actual: Secret loading fails with "Failed to load identity secret"
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { tmpdir } from 'os';

let testDataDir: string;
let app: ElectronApplication;
let mainWindow: Page;

test.describe('Bug: Identity secret loading in dev mode', () => {
  test.beforeAll(async () => {
    // Create temporary data directory for this test
    testDataDir = path.join(tmpdir(), `nostling-test-${Date.now()}`);
    fs.mkdirSync(testDataDir, { recursive: true });
  });

  test.afterAll(async () => {
    // Cleanup
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  test.afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  test('identity secret should persist across app restarts in dev mode', async () => {
    // ========================================================================
    // FIRST RUN: Create identity with private key
    // ========================================================================

    app = await electron.launch({
      args: [path.join(__dirname, '../dist/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        NOSTLING_DATA_DIR: testDataDir,
      },
    });

    mainWindow = await app.firstWindow();
    await mainWindow.waitForLoadState('domcontentloaded');

    // Create a new identity
    const createButton = mainWindow.locator('button[data-testid="create-identity"]');
    await createButton.waitFor({ state: 'visible', timeout: 10000 });
    await createButton.click();

    // Wait for identity to be created (presence of profile edit section)
    const profileSection = mainWindow.locator('[data-testid="profile-editor"]');
    await profileSection.waitFor({ state: 'visible', timeout: 5000 });

    // Get the identity ID for later verification
    const identityCard = mainWindow.locator('[data-testid^="identity-card-"]').first();
    await identityCard.waitFor({ state: 'visible', timeout: 5000 });
    const identityId = (await identityCard.getAttribute('data-testid'))?.replace('identity-card-', '') || '';
    expect(identityId).toBeTruthy();

    // Update the private profile
    const displayNameInput = mainWindow.locator('input[placeholder="Display name"]');
    await displayNameInput.waitFor({ state: 'visible', timeout: 5000 });
    await displayNameInput.fill('Test Identity First Run');

    const aboutInput = mainWindow.locator('textarea[placeholder*="about yourself"]');
    await aboutInput.fill('Test about section first run');

    // Save the profile
    const saveButton = mainWindow.locator('button:has-text("Save")');
    await saveButton.click();

    // Wait for save to complete (button should be re-enabled)
    await expect(saveButton).not.toBeDisabled({ timeout: 5000 });

    // Close the app
    await app.close();

    // ========================================================================
    // SECOND RUN: Restart app with persisted data
    // ========================================================================

    // Wait a bit to ensure clean shutdown
    await new Promise(resolve => setTimeout(resolve, 1000));

    app = await electron.launch({
      args: [path.join(__dirname, '../dist/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        NOSTLING_DATA_DIR: testDataDir,
      },
    });

    mainWindow = await app.firstWindow();
    await mainWindow.waitForLoadState('domcontentloaded');

    // Verify identity still exists
    const identityCardAfterRestart = mainWindow.locator(`[data-testid="identity-card-${identityId}"]`);
    await identityCardAfterRestart.waitFor({ state: 'visible', timeout: 5000 });

    // Try to update the profile again (this should trigger secret loading)
    await identityCardAfterRestart.click();

    const displayNameInputAfterRestart = mainWindow.locator('input[placeholder="Display name"]');
    await displayNameInputAfterRestart.waitFor({ state: 'visible', timeout: 5000 });
    await displayNameInputAfterRestart.fill('Test Identity After Restart');

    const aboutInputAfterRestart = mainWindow.locator('textarea[placeholder*="about yourself"]');
    await aboutInputAfterRestart.fill('Test about section after restart');

    // Save the profile - THIS SHOULD FAIL with "Failed to load identity secret"
    const saveButtonAfterRestart = mainWindow.locator('button:has-text("Save")');
    await saveButtonAfterRestart.click();

    // BUG: This test currently FAILS because secret loading fails after restart
    // Expected: Save succeeds
    // Actual: Error "Failed to load identity secret" is thrown
    //
    // The error should appear in console logs or as an error notification
    // For now, we expect this test to fail until the bug is fixed

    // Wait for save result (timeout indicates failure)
    // When bug is fixed, this should complete successfully
    await expect(saveButtonAfterRestart).not.toBeDisabled({ timeout: 5000 });

    // Verify the changes were saved (by checking the input values are preserved)
    expect(await displayNameInputAfterRestart.inputValue()).toBe('Test Identity After Restart');
  });
});
