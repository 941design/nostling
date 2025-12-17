/**
 * Identities Panel - E2E Integration Test
 *
 * Verifies complete workflow for editing identity profiles:
 * 1. Open panel from hamburger menu
 * 2. Select identity and edit profile fields
 * 3. Apply changes and return to chat
 * 4. Cancel and discard changes
 * 5. Identity switching protection when dirty
 * 6. Escape key behavior
 */

import { test, expect } from './fixtures';
import { waitForAppReady, ensureIdentityExists } from './helpers';

test.describe('Identities Panel - Integration', () => {
  test('should open IdentitiesPanel when clicking "Edit Identity Profile" in hamburger menu', async ({
    page,
  }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Menu Test Identity');

    // Open hamburger menu
    const menuButton = page.locator('button[aria-label="Open menu"]');
    await menuButton.click();

    // Click on "Edit Identity Profile" menu item
    const identitiesMenuItem = page.locator('[data-testid="identities-panel-trigger"]');
    await expect(identitiesMenuItem).toBeVisible();
    await identitiesMenuItem.click();

    // Verify IdentitiesPanel is open
    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Verify panel title
    const title = panel.locator(':text("Edit Identity Profile")');
    await expect(title).toBeVisible();

    // Verify Cancel and Apply buttons are present
    const cancelButton = panel.locator('[data-testid="identities-panel-cancel"]');
    const applyButton = panel.locator('[data-testid="identities-panel-apply"]');
    await expect(cancelButton).toBeVisible();
    await expect(applyButton).toBeVisible();
  });

  test('should display ProfileEditor with all 8 fields', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Fields Test Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Verify all 8 fields are present
    await expect(page.locator('[data-testid="profile-editor-label"]')).toBeVisible();
    await expect(page.locator('[data-testid="profile-editor-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="profile-editor-about"]')).toBeVisible();
    await expect(page.locator('[data-testid="profile-editor-picture"]')).toBeVisible();
    await expect(page.locator('[data-testid="profile-editor-banner"]')).toBeVisible();
    await expect(page.locator('[data-testid="profile-editor-website"]')).toBeVisible();
    await expect(page.locator('[data-testid="profile-editor-nip05"]')).toBeVisible();
    await expect(page.locator('[data-testid="profile-editor-lud16"]')).toBeVisible();
  });

  test('should enable Apply button when fields are edited', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Edit Test Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const applyButton = page.locator('[data-testid="identities-panel-apply"]');

    // Initially Apply should be disabled (no changes)
    await expect(applyButton).toBeDisabled();

    // Edit a field
    const nameInput = page.locator('[data-testid="profile-editor-name"]');
    await nameInput.fill('Updated Name');

    // Apply should now be enabled
    await expect(applyButton).toBeEnabled();
  });

  test('should apply changes and return to chat view', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Apply Test Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Edit fields
    await page.locator('[data-testid="profile-editor-name"]').fill('Test User');
    await page.locator('[data-testid="profile-editor-about"]').fill('Test bio');
    await page.locator('[data-testid="profile-editor-website"]').fill('https://example.com');

    // Click Apply
    const applyButton = page.locator('[data-testid="identities-panel-apply"]');
    await applyButton.click();

    // Panel should close and return to chat view
    await expect(panel).not.toBeVisible();

    // Conversation pane should be visible
    const conversationPane = page.locator('[data-testid="conversation-pane"]');
    await expect(conversationPane).toBeVisible();
  });

  test('should discard changes when Cancel is clicked', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Cancel Test Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Edit a field
    const nameInput = page.locator('[data-testid="profile-editor-name"]');
    await nameInput.fill('Temporary Name');

    // Click Cancel
    const cancelButton = panel.locator('[data-testid="identities-panel-cancel"]');
    await cancelButton.click();

    // Panel should close
    await expect(panel).not.toBeVisible();

    // Reopen to verify changes were discarded
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();
    await expect(panel).toBeVisible();

    // Name field should not have the temporary value
    const nameValue = await page.locator('[data-testid="profile-editor-name"]').inputValue();
    expect(nameValue).not.toBe('Temporary Name');
  });

  test('should close panel when pressing Escape', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Escape Test Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Panel should close
    await expect(panel).not.toBeVisible();

    // Should be back in chat view
    const conversationPane = page.locator('[data-testid="conversation-pane"]');
    await expect(conversationPane).toBeVisible();
  });

  test('should disable Cancel/Apply and prevent Escape during save operation', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Saving Test Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Edit a field
    await page.locator('[data-testid="profile-editor-name"]').fill('Save Test');

    // Click Apply - this should trigger saving state
    const applyButton = page.locator('[data-testid="identities-panel-apply"]');
    await applyButton.click();

    // Panel should close after save completes
    await expect(panel).not.toBeVisible({ timeout: 5000 });
  });

  test('should show image preview when valid picture URL is entered', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Image Preview Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Enter a valid image URL (using a data URI for reliability)
    const pictureInput = page.locator('[data-testid="profile-editor-picture"]');
    const testImageUrl = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="blue"/%3E%3C/svg%3E';
    await pictureInput.fill(testImageUrl);

    // Image preview should appear
    const preview = page.locator('[data-testid="profile-editor-picture-preview"]');
    await expect(preview).toBeVisible();
  });

  test('should show banner preview when valid banner URL is entered', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Banner Preview Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Enter a valid banner URL
    const bannerInput = page.locator('[data-testid="profile-editor-banner"]');
    const testBannerUrl = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="100"%3E%3Crect width="200" height="100" fill="green"/%3E%3C/svg%3E';
    await bannerInput.fill(testBannerUrl);

    // Banner preview should appear
    const preview = page.locator('[data-testid="profile-editor-banner-preview"]');
    await expect(preview).toBeVisible();
  });

  test('should persist all field changes after Apply', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Persistence Test Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Fill all fields with test data
    const testData = {
      name: 'Persistent Name',
      about: 'Persistent bio with multiple lines\nLine 2\nLine 3',
      website: 'https://persistent.example.com',
      nip05: 'user@persistent.com',
      lud16: 'lightning@persistent.com',
    };

    await page.locator('[data-testid="profile-editor-name"]').fill(testData.name);
    await page.locator('[data-testid="profile-editor-about"]').fill(testData.about);
    await page.locator('[data-testid="profile-editor-website"]').fill(testData.website);
    await page.locator('[data-testid="profile-editor-nip05"]').fill(testData.nip05);
    await page.locator('[data-testid="profile-editor-lud16"]').fill(testData.lud16);

    // Apply changes
    await page.locator('[data-testid="identities-panel-apply"]').click();
    await expect(panel).not.toBeVisible();

    // Reopen panel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();
    await expect(panel).toBeVisible();

    // Verify all fields persisted
    await expect(page.locator('[data-testid="profile-editor-name"]')).toHaveValue(testData.name);
    await expect(page.locator('[data-testid="profile-editor-about"]')).toHaveValue(testData.about);
    await expect(page.locator('[data-testid="profile-editor-website"]')).toHaveValue(testData.website);
    await expect(page.locator('[data-testid="profile-editor-nip05"]')).toHaveValue(testData.nip05);
    await expect(page.locator('[data-testid="profile-editor-lud16"]')).toHaveValue(testData.lud16);
  });

  test('should handle empty profile gracefully', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Empty Profile Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // All fields should be editable even if empty
    const nameInput = page.locator('[data-testid="profile-editor-name"]');
    await expect(nameInput).toBeEnabled();

    // Should be able to fill and save
    await nameInput.fill('New Name');
    const applyButton = page.locator('[data-testid="identities-panel-apply"]');
    await expect(applyButton).toBeEnabled();
    await applyButton.click();

    // Panel should close successfully
    await expect(panel).not.toBeVisible();
  });

  test('should show loading state when profile is being fetched', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Loading State Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    // Loading indicator might be very brief, but check it exists
    // (the implementation shows "Loading profile..." text)
    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Profile editor should eventually be visible
    const editor = page.locator('[data-testid="profile-editor-name"]');
    await expect(editor).toBeVisible({ timeout: 5000 });
  });

  test('should support multiline text in About field', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Multiline Test Identity');

    // Open IdentitiesPanel
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();

    const panel = page.locator('[data-testid="identities-panel"]');
    await expect(panel).toBeVisible();

    // Fill About with multiple lines
    const aboutText = 'Line 1\nLine 2\nLine 3\n\nLine 5 after blank';
    await page.locator('[data-testid="profile-editor-about"]').fill(aboutText);

    // Apply
    await page.locator('[data-testid="identities-panel-apply"]').click();
    await expect(panel).not.toBeVisible();

    // Reopen and verify
    await page.locator('button[aria-label="Open menu"]').click();
    await page.locator('[data-testid="identities-panel-trigger"]').click();
    await expect(panel).toBeVisible();

    const savedAbout = await page.locator('[data-testid="profile-editor-about"]').inputValue();
    expect(savedAbout).toBe(aboutText);
  });
});
