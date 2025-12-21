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

test.describe('Message info button (production mode)', () => {
  /**
   * This test verifies that when NOSTLING_SHOW_MESSAGE_INFO is not set (production mode),
   * the message info button is NOT displayed even when hovering over messages.
   */
  test('info button is NOT visible when showMessageInfo is false', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Prod Mode Test Identity');

    await createContact(page, 'npub1prodtest', 'Prod Test Contact');

    // Send a test message
    const messageBubble = await sendTestMessage(page, 'Production mode test message');

    // Initially, info button should not be visible (not hovered)
    const infoButton = messageBubble.locator('[data-testid="message-info-button"]');
    await expect(infoButton).toHaveCount(0);

    // Hover over the message bubble
    await messageBubble.hover();

    // In production mode, info button should still NOT be visible even when hovered
    // This is the key difference from dev mode where the button would appear on hover
    await expect(infoButton).toHaveCount(0);
  });

  test('message info modal cannot be opened in production mode', async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Prod Modal Test Identity');

    await createContact(page, 'npub1prodmodaltest', 'Prod Modal Test Contact');

    // Send a test message
    const messageBubble = await sendTestMessage(page, 'Modal test in production mode');

    // Hover over the message bubble
    await messageBubble.hover();

    // Verify that clicking on the message bubble area doesn't open the modal
    // (since there's no info button to click)
    await messageBubble.click();

    // Modal should not be open
    const modal = page.locator('[data-testid="message-info-modal"]');
    await expect(modal).toHaveCount(0);
  });
});
