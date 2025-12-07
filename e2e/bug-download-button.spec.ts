import { test, expect } from './fixtures';
import { waitForAppReady, waitForUpdatePhase } from './helpers';

test.describe('Bug: Download Update Button Not Working', () => {
  test('should call downloadUpdate when clicking Download update button', async ({ page, electronApp }) => {
    /**
     * Regression test: Download update button calls downloadUpdate, not checkForUpdates
     *
     * Bug report: bug-reports/download-update-button-not-working-report.md
     * Fixed: 2025-12-07
     * Root cause: handlePrimary() in src/renderer/main.tsx was calling onCheck()
     *             for all non-ready phases, including 'available'
     *
     * Protection: Ensures that when phase is 'available' and user clicks "Download update",
     *            the app calls downloadUpdate() (nested API), not checkForUpdates()
     *
     * Expected: Phase should NOT be 'checking' or 'available' after clicking
     *          (should transition to 'downloading' or 'failed' in test environment)
     */
    await waitForAppReady(page);

    // Set update state to 'available' (update detected, ready to download)
    await electronApp.evaluate(async ({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows[0]) {
        windows[0].webContents.send('update-state', {
          phase: 'available',
          version: '1.0.0'
        });
      }
    });

    await waitForUpdatePhase(page, 'available');

    // Verify button shows "Download update"
    const button = page.locator('button.primary');
    await expect(button).toHaveText('Download update');

    // Click the "Download update" button
    await button.click();

    // Wait a moment for the state change
    await page.waitForTimeout(200);

    // Get current phase after button click
    const phaseAfterClick = await page.locator('.update-phase').textContent();
    console.log('Phase after clicking Download update:', phaseAfterClick);

    // BUG: Currently the phase will be 'checking' or 'available'
    // (because it re-checks instead of downloading)
    // Expected: Should be 'downloading'

    // This assertion will FAIL, demonstrating the bug
    // When fixed, clicking "Download update" should NOT trigger a check
    expect(phaseAfterClick).not.toContain('checking');
    expect(phaseAfterClick).not.toContain('available'); // Should have moved to downloading
  });
});
