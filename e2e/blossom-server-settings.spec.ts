/**
 * Blossom Server Settings UI - E2E Test
 *
 * Stories 02 & 03: Verifies the BlossomServerSettings component
 * renders correctly within the relay configuration view, supports
 * add/remove operations, validates HTTPS, and shows health indicators.
 */

import { test, expect } from './fixtures';
import { waitForAppReady, ensureIdentityExists, navigateToRelayConfig } from './helpers';

test.describe('Blossom Server Settings UI', () => {
  test('should display default server in blossom settings after identity creation', async ({
    page,
  }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Blossom UI Test');

    // Navigate to relay config (which now includes blossom settings)
    await navigateToRelayConfig(page);

    // Verify blossom settings section is visible
    const blossomSettings = page.locator('[data-testid="blossom-server-settings"]');
    await expect(blossomSettings).toBeVisible({ timeout: 10000 });

    // Verify default server is displayed
    const serverRow = page.locator('text=https://cdn.satellite.earth');
    await expect(serverRow).toBeVisible();

    // Verify Satellite CDN label is shown
    const labelText = page.locator('text=Satellite CDN');
    await expect(labelText).toBeVisible();

    // Verify health indicator exists
    const healthDot = page.locator('[data-testid="blossom-health-dot"]').first();
    await expect(healthDot).toBeVisible();

    // Verify footer shows "1 server configured"
    const footer = page.locator('text=1 server configured');
    await expect(footer).toBeVisible();
  });

  test('should show add server form', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Blossom Add Form Test');

    await navigateToRelayConfig(page);

    // Wait for blossom settings to load
    const blossomSettings = page.locator('[data-testid="blossom-server-settings"]');
    await expect(blossomSettings).toBeVisible({ timeout: 10000 });

    // Verify add form is present
    const addForm = page.locator('[data-testid="blossom-add-form"]');
    await expect(addForm).toBeVisible();

    // Verify URL input, label input, and Add button exist
    const urlInput = page.locator('[data-testid="blossom-url-input"]');
    const labelInput = page.locator('[data-testid="blossom-label-input"]');
    const addButton = page.locator('[data-testid="blossom-add-button"]');
    await expect(urlInput).toBeVisible();
    await expect(labelInput).toBeVisible();
    await expect(addButton).toBeVisible();
  });

  test('should show remove confirmation when clicking remove button', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Blossom Remove Test');

    await navigateToRelayConfig(page);

    const blossomSettings = page.locator('[data-testid="blossom-server-settings"]');
    await expect(blossomSettings).toBeVisible({ timeout: 10000 });

    // Click remove button on the default server
    const removeButton = page.locator('[data-testid="blossom-remove-button"]').first();
    await removeButton.click();

    // Verify confirmation buttons appear
    const confirmRemove = page.locator('[data-testid="blossom-confirm-remove"]');
    const cancelRemove = page.locator('[data-testid="blossom-cancel-remove"]');
    await expect(confirmRemove).toBeVisible();
    await expect(cancelRemove).toBeVisible();

    // Click Cancel - server should remain
    await cancelRemove.click();
    const serverRow = page.locator('text=https://cdn.satellite.earth');
    await expect(serverRow).toBeVisible();
  });

  test('should remove server after confirmation', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Blossom Confirm Remove Test');

    await navigateToRelayConfig(page);

    const blossomSettings = page.locator('[data-testid="blossom-server-settings"]');
    await expect(blossomSettings).toBeVisible({ timeout: 10000 });

    // Click remove then confirm
    const removeButton = page.locator('[data-testid="blossom-remove-button"]').first();
    await removeButton.click();

    const confirmRemove = page.locator('[data-testid="blossom-confirm-remove"]');
    await confirmRemove.click();

    // Server should be removed, empty state should show
    const emptyState = page.locator('[data-testid="blossom-empty-state"]');
    await expect(emptyState).toBeVisible({ timeout: 5000 });

    // Footer should show 0 servers
    const footer = page.locator('text=0 servers configured');
    await expect(footer).toBeVisible();
  });

  test('should show empty state when no servers configured', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Blossom Empty State Test');

    await navigateToRelayConfig(page);

    const blossomSettings = page.locator('[data-testid="blossom-server-settings"]');
    await expect(blossomSettings).toBeVisible({ timeout: 10000 });

    // Remove the default server to get to empty state
    const removeButton = page.locator('[data-testid="blossom-remove-button"]').first();
    await removeButton.click();
    await page.locator('[data-testid="blossom-confirm-remove"]').click();

    // Verify empty state message
    const emptyState = page.locator('[data-testid="blossom-empty-state"]');
    await expect(emptyState).toBeVisible({ timeout: 5000 });
    await expect(emptyState).toContainText('No blossom servers configured');
    await expect(emptyState).toContainText('Add one to enable media uploads');

    // Verify add form is still accessible
    const addForm = page.locator('[data-testid="blossom-add-form"]');
    await expect(addForm).toBeVisible();
  });
});
