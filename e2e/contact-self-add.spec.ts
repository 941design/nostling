import { expect } from '@playwright/test';
import { test } from './fixtures';
import { ensureIdentityExists, waitForAppReady } from './helpers';

test.describe('Contact self-add prevention', () => {
  test('shows error when trying to add own npub as contact', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Self Add Test Identity');

    // Get the identity's npub from the data-npub attribute
    const identityItem = page.locator('[data-testid^="identity-item-"]').first();
    const selfNpub = await identityItem.getAttribute('data-npub');
    expect(selfNpub).toBeTruthy();

    // Open add contact modal
    await page.locator('button[aria-label="Add contact"]').click();
    await page.waitForSelector('text=Add Contact', { timeout: 5000 });

    // Try to add self as contact
    await page.locator('input[placeholder="npub..."]').fill(selfNpub!);
    await page.locator('input[placeholder="Friend"]').fill('Myself');
    await page.locator('button:has-text("Save")').click();

    // Should show error message in footer (modal closes but error is displayed)
    await expect(page.locator('text=Cannot add yourself as a contact')).toBeVisible({ timeout: 5000 });

    // No contact should appear in the sidebar
    const contactItems = page.locator('[data-testid^="contact-item-"]');
    await expect(contactItems).toHaveCount(0);
  });
});
