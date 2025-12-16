/**
 * Theme Persistence E2E Test
 *
 * Verifies that theme selection is persisted to database and
 * properly returned when listing identities, and that it persists
 * across page reloads.
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
    await page.waitForTimeout(100);

    // Click on Theme panel trigger to open ThemeSelectionPanel
    await page.locator('[data-testid="theme-panel-trigger"]').click();

    // Verify ThemeSelectionPanel is open
    const panel = page.locator('[data-testid="theme-selection-panel"]');
    await expect(panel).toBeVisible();

    // Get current theme name
    const themeInfo = panel.locator('[data-testid="theme-info-name"]');
    await expect(themeInfo).toBeVisible();
    const initialThemeName = await themeInfo.textContent();

    // Navigate to a different theme (click next)
    const nextButton = panel.locator('[data-testid="theme-carousel-next"]');
    await nextButton.click();
    await page.waitForTimeout(100);

    // Get the new theme name (should be different from initial)
    const selectedThemeName = await themeInfo.textContent();
    expect(selectedThemeName).not.toBe(initialThemeName);

    // Click OK to apply the theme
    await panel.locator('[data-testid="theme-panel-ok"]').click();

    // Panel should close after applying
    await expect(panel).not.toBeVisible();

    // Wait for theme to be applied
    await page.waitForTimeout(500);

    // Reload the page to verify persistence across sessions
    await page.reload();
    await waitForAppReady(page);

    // Wait for identity to auto-select
    await page.waitForTimeout(500);

    // Open theme panel again
    await page.locator('button[aria-label="Open menu"]').click();
    await page.waitForTimeout(100);
    await page.locator('[data-testid="theme-panel-trigger"]').click();

    // Verify panel is open and shows the selected theme as current
    const panelAfterReload = page.locator('[data-testid="theme-selection-panel"]');
    await expect(panelAfterReload).toBeVisible();

    // Check that the "current" badge is showing (theme was persisted)
    const currentBadge = panelAfterReload.locator('[data-testid="theme-info-current-badge"]');
    await expect(currentBadge).toBeVisible();

    // Verify it's still the same theme we selected (persisted correctly)
    const themeNameAfterReload = await panelAfterReload.locator('[data-testid="theme-info-name"]').textContent();
    expect(themeNameAfterReload).toBe(selectedThemeName);
  });
});
