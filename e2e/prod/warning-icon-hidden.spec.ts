import { expect, Page } from '@playwright/test';
import { test } from '../fixtures';
import { ensureIdentityExists, waitForAppReady } from '../helpers';

/**
 * Helper to create a contact for messaging
 */
async function createContact(page: Page, npub: string, alias: string) {
  await page.locator('button[aria-label="Add contact"]').click();
  await page.locator('input[placeholder="npub..."]').fill(npub);
  await page.locator('input[placeholder="Friend"]').fill(alias);
  await page.locator('button:has-text("Save")').click();

  const contactItem = page.locator('[data-testid^="contact-item-"]', { hasText: alias });
  await expect(contactItem).toBeVisible();
  await contactItem.click();
}

/**
 * Helper to send a test message
 */
async function sendTestMessage(page: Page, content: string) {
  const textarea = page.locator('textarea[placeholder*="Type a message"]');
  await textarea.fill(content);
  await page.keyboard.press('Enter');

  // Wait for a message bubble containing this exact content to be visible
  const messageBubbles = page.locator('[data-testid="message-bubble"]');
  await expect(messageBubbles.filter({ hasText: content }).first()).toBeVisible({ timeout: 5000 });

  // Get all matching bubbles and use the first visible one
  const matchingBubble = messageBubbles.filter({ hasText: content }).first();
  const messageId = await matchingBubble.getAttribute('data-message-id');

  return page.locator(`[data-testid="message-bubble"][data-message-id="${messageId}"]`);
}

test.describe('Warning icon (production mode)', () => {
  /**
   * This test verifies that when NOSTLING_SHOW_WARNING_ICON is not set (production mode),
   * the warning icon is NOT displayed for non-gift-wrapped messages.
   */
  test('warning icon is NOT visible when showWarningIcon is false', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Prod Warning Test Identity');

    await createContact(page, 'npub1prodwarningtest', 'Prod Warning Test Contact');

    // Send a test message (will be non-gift-wrapped since we're sending to ourselves essentially)
    const messageBubble = await sendTestMessage(page, 'Production mode warning test message');

    // In production mode, warning icon should NOT be visible
    // This is the key difference from dev mode where the warning icon would appear
    const warningIcon = messageBubble.locator('[data-testid="not-gift-wrapped-warning"]');
    await expect(warningIcon).toHaveCount(0);
  });
});
