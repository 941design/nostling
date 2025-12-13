/**
 * Theme Persistence E2E Test
 *
 * Verifies that theme selection is persisted to database and
 * properly returned when listing identities.
 *
 * Bug: Theme is updated in database (log confirms) but not returned
 * by listIdentities() because the SQL query doesn't select the theme column.
 */

import { test, expect } from './fixtures';
import { waitForAppReady, ensureIdentityExists } from './helpers';

test.describe('Theme Persistence', () => {
  test('should persist theme selection and return it when listing identities', async ({ page }) => {
    await waitForAppReady(page);

    // 1. Create an identity
    await ensureIdentityExists(page, 'Theme Test Identity');

    // 2. Get the identity list and extract the first identity's ID
    // We need to use page.evaluate to access the API directly
    const identitiesBefore = await page.evaluate(async () => {
      const identities = await window.api.nostling?.identities.list();
      return identities;
    });

    expect(identitiesBefore).toBeDefined();
    expect(identitiesBefore!.length).toBeGreaterThan(0);

    const identityId = identitiesBefore![0].id;
    const themeBefore = identitiesBefore![0].theme;

    // Theme should default to 'dark' or be undefined initially
    // (migration sets default to 'dark')
    console.log(`Theme before update: ${themeBefore}`);

    // 3. Update theme to 'amber' via IPC
    await page.evaluate(async (id) => {
      await window.api.nostling?.identities.updateTheme(id, 'amber');
    }, identityId);

    // 4. List identities again and verify theme is 'amber'
    const identitiesAfter = await page.evaluate(async () => {
      const identities = await window.api.nostling?.identities.list();
      return identities;
    });

    expect(identitiesAfter).toBeDefined();
    const updatedIdentity = identitiesAfter!.find((i: any) => i.id === identityId);
    expect(updatedIdentity).toBeDefined();

    // THIS IS THE FAILING ASSERTION
    // The theme should be 'amber' but will be undefined due to the bug
    expect(updatedIdentity!.theme).toBe('amber');
  });

  test('should apply theme visually after selection', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Visual Theme Test');

    // Open hamburger menu
    await page.locator('button[aria-label="Open menu"]').click();

    // Click on Theme selector trigger
    await page.locator('[data-testid="theme-selector-trigger"]').click();

    // Select the 'amber' theme
    await page.locator('[data-testid="theme-option-amber"]').click();

    // Wait for theme to be applied (DOM update)
    await page.waitForTimeout(500);

    // Re-open menu to verify theme shows as selected
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="theme-selector-trigger"]').click();

    // The amber option should now have the checkmark
    const amberCheckmark = page.locator('[data-testid="theme-swatch-checkmark-amber"]');
    await expect(amberCheckmark).toBeVisible();

    // Close menu
    await page.keyboard.press('Escape');

    // Reload the page to verify persistence across sessions
    await page.reload();
    await waitForAppReady(page);

    // Select the identity again (it should auto-select first)
    await page.waitForTimeout(500);

    // Open menu and check theme is still amber
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="theme-selector-trigger"]').click();

    // The amber checkmark should still be visible (theme was persisted)
    // THIS WILL FAIL due to the bug - theme is not returned from listIdentities
    await expect(amberCheckmark).toBeVisible();
  });
});
