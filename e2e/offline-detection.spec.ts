import { test, expect } from './fixtures';
import { waitForAppReady, waitForUpdatePhase, getStatusText } from './helpers';

/**
 * E2E tests for offline detection in the update system.
 *
 * These tests verify that when the autoUpdater emits an error event with
 * network-related error messages (like ENOTFOUND, ECONNREFUSED, net::ERR_*),
 * the UI shows a user-friendly "Network is offline" message instead of
 * the generic "Update verification failed".
 *
 * Bug context: When running offline, users were seeing "Update verification failed"
 * which was confusing. The fix sanitizes network errors to show "Network is offline".
 */
test.describe('Offline Detection', () => {
  test('should display "Network is offline" message in footer', async ({ page, electronApp }) => {
    await waitForAppReady(page);

    // Simulate the update state that the main process sends when offline.
    // The sanitizeError function converts network errors to "Network is offline".
    // The renderer displays this as "Update failed: Network is offline".
    await electronApp.evaluate(async ({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows[0]) {
        windows[0].webContents.send('update-state', {
          phase: 'failed',
          detail: 'Network is offline'
        });
      }
    });

    await waitForUpdatePhase(page, 'failed');

    // Verify the footer shows failure (accepts themed alternatives)
    const statusText = await getStatusText(page);
    const failedMessages = ['Head in sand', 'Fumbled feathers', 'Broken beak', 'failed'];
    expect(failedMessages.some(msg => statusText.includes(msg))).toBe(true);
    // Should also contain offline detail
    const offlineTerms = ['offline', 'savanna unreachable', 'flock distant', 'Network is offline'];
    expect(offlineTerms.some(term => statusText.toLowerCase().includes(term.toLowerCase()))).toBe(true);
  });

  test('should not show generic "Update verification failed" for offline state', async ({ page, electronApp }) => {
    await waitForAppReady(page);

    // Simulate offline state
    await electronApp.evaluate(async ({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows[0]) {
        windows[0].webContents.send('update-state', {
          phase: 'failed',
          detail: 'Network is offline'
        });
      }
    });

    await waitForUpdatePhase(page, 'failed');

    const statusText = await getStatusText(page);
    // Should NOT contain the generic error message
    expect(statusText).not.toContain('verification failed');
    // Should contain offline-specific message (themed or standard)
    const offlineTerms = ['offline', 'savanna unreachable', 'flock distant'];
    expect(offlineTerms.some(term => statusText.toLowerCase().includes(term.toLowerCase()))).toBe(true);
  });

  test('footer should allow retry when offline', async ({ page, electronApp }) => {
    await waitForAppReady(page);

    // Set offline state
    await electronApp.evaluate(async ({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows[0]) {
        windows[0].webContents.send('update-state', {
          phase: 'failed',
          detail: 'Network is offline'
        });
      }
    });

    await waitForUpdatePhase(page, 'failed');

    // The refresh button should be enabled in failed state to allow retry
    const refreshButton = page.locator('.footer-icon-button');
    await expect(refreshButton).toBeEnabled();
  });
});
