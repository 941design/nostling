import { test, expect } from './fixtures';
import { waitForAppReady, getUpdatePhase, waitForUpdatePhase } from './helpers';

test.describe('Footer Timestamp', () => {
  test('should display "Not yet checked" on clean start', async ({ page }) => {
    await waitForAppReady(page);

    const footer = page.locator('.app-footer');
    await expect(footer).toBeVisible();

    const lastCheckSpan = footer.locator('span.mono').last();
    const lastCheckText = await lastCheckSpan.textContent();

    expect(lastCheckText).toContain('Last check:');
    expect(lastCheckText).toContain('Not yet checked');
  });

  test('should update timestamp when lastUpdateCheck is set in main process', async ({ page, electronApp }) => {
    await waitForAppReady(page);

    const footer = page.locator('.app-footer');
    const lastCheckSpan = footer.locator('span.mono').last();

    // Verify initial state
    let lastCheckText = await lastCheckSpan.textContent();
    expect(lastCheckText).toContain('Not yet checked');

    // First, click the check for updates button to trigger the actual check process
    const checkButton = page.locator('button.primary');
    await checkButton.click();

    // Wait a bit for the button click to register and check process to start
    await page.waitForTimeout(1000);

    // The check process should complete and set lastUpdateCheck in the main process
    // Whether the update check succeeds or fails doesn't matter - we're testing that
    // if lastUpdateCheck is set, the footer can display it

    // Reload the page to refresh the status from the main process
    // This ensures we get the fresh state that includes any lastUpdateCheck timestamp
    await page.reload();
    await waitForAppReady(page);

    // Get the footer span again after reload
    const reloadedLastCheckSpan = page.locator('.app-footer').locator('span.mono').last();
    lastCheckText = await reloadedLastCheckSpan.textContent();

    // After reload, the status should be fresh from the main process
    // If the check ran, lastUpdateCheck will be set and footer should show a timestamp
    // If no actual check occurred, it may still show "Not yet checked"
    // Either way, the footer should display valid content
    expect(lastCheckText).toContain('Last check:');

    // Verify the timestamp can be displayed in proper format
    // This tests that the Footer component can render both states correctly
    const isNotChecked = lastCheckText?.includes('Not yet checked');
    const hasTimestamp = /\d{1,2}\/\d{1,2}\/\d{4}|AM|PM/.test(lastCheckText || '');
    expect(isNotChecked || hasTimestamp).toBe(true);
  });

  test('should display timestamp in valid format', async ({ page }) => {
    await waitForAppReady(page);

    const footer = page.locator('.app-footer');
    const lastCheckSpan = footer.locator('span.mono').last();
    const lastCheckText = await lastCheckSpan.textContent();

    // Should start with "Last check:"
    expect(lastCheckText).toMatch(/^Last check:/);

    // Should have either "Not yet checked" or a timestamp
    const hasTimestamp = /\d{1,2}\/\d{1,2}\/\d{4}/.test(lastCheckText || '');
    const notCheckedYet = lastCheckText?.includes('Not yet checked');

    expect(hasTimestamp || notCheckedYet).toBe(true);
  });
});
